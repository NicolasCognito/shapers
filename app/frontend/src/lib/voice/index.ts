import { useCallback, useEffect, useRef, useState } from "react"

import { BrowserSpeechEngine } from "./browser-engine"
import { ServerSpeechEngine } from "./server-engine"
import type { SpeechEngine, VoiceState } from "./types"

export type { SpeechEngine, VoiceState } from "./types"

// Preference order. The first available engine is used; if it fails with a
// fallback-worthy error, the next one takes over. To change providers, reorder
// or add engines here — the mic button and chat stay untouched.
const ENGINES: SpeechEngine[] = [new BrowserSpeechEngine(), new ServerSpeechEngine()]

const BCP47: Record<string, string> = { en: "en-US", sl: "sl-SI" }

async function availableEngines(): Promise<SpeechEngine[]> {
  const ok = await Promise.all(ENGINES.map((e) => Promise.resolve(e.available()).catch(() => false)))
  return ENGINES.filter((_, i) => ok[i])
}

/**
 * Hold-to-talk / click-to-toggle voice input.
 * `lang` is the UI language ("en", "sl"); results go to onText.
 */
export function useVoiceInput({
  lang,
  onText,
  onPartial,
  onError,
}: {
  lang: string
  onText: (text: string) => void
  onPartial?: (text: string) => void
  onError?: (message: string) => void
}) {
  const [state, setState] = useState<VoiceState>("idle")
  const [supported, setSupported] = useState(false)
  const engines = useRef<SpeechEngine[]>([])
  const active = useRef<SpeechEngine | null>(null)
  const cbs = useRef({ onText, onPartial, onError })
  cbs.current = { onText, onPartial, onError }

  useEffect(() => {
    let alive = true
    availableEngines().then((list) => {
      if (!alive) return
      engines.current = list
      setSupported(list.length > 0)
    })
    return () => {
      alive = false
      active.current?.cancel()
    }
  }, [])

  const run = useCallback(
    (index: number) => {
      const engine = engines.current[index]
      if (!engine) return
      active.current = engine
      void engine.start(BCP47[lang] ?? lang, {
        onPartial: (t) => cbs.current.onPartial?.(t),
        onFinal: (t) => cbs.current.onText(t),
        onState: (s) => {
          setState(s)
          if (s === "idle" && active.current === engine) active.current = null
        },
        onError: (message, opts) => {
          if (opts?.fallback && engines.current[index + 1]) {
            run(index + 1) // e.g. browser recognition has no network → record and use the server
            return
          }
          setState("idle")
          cbs.current.onError?.(message)
        },
      })
    },
    [lang]
  )

  const start = useCallback(() => {
    if (active.current) return
    run(0)
  }, [run])
  const stop = useCallback(() => active.current?.stop(), [])
  const cancel = useCallback(() => active.current?.cancel(), [])
  const toggle = useCallback(() => (active.current ? stop() : start()), [start, stop])

  return { supported, state, start, stop, cancel, toggle, engine: active.current?.id }
}
