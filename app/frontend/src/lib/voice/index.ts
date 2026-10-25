import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { BrowserSpeechEngine } from "./browser-engine"
import { ServerSpeechEngine } from "./server-engine"
import type { SpeechEngine, VoiceState } from "./types"

export type { SpeechEngine, VoiceState } from "./types"

// Preference order. The first available engine is used; if it fails with a
// fallback-worthy error, the next one takes over. To change providers, reorder
// or add engines here — the mic button and chat stay untouched.
//
// Why two engines, not one:
// - Browser (Web Speech, Chrome/Edge/Safari): real-time — words appear in the
//   input while you speak, free, no upload. But only some browsers, it needs
//   the language set in advance, and audio goes to the browser vendor.
// - Server (Groq Whisper): works everywhere MediaRecorder does (Firefox,
//   Slack/Telegram in-app WebViews), detects the language itself, our key and
//   our provider. But text only after you stop, and it costs per minute.
// So: language "Auto" → server first (detection); a fixed language → browser
// first (live text); either falls back to the other when it fails. Both sit
// behind the same SpeechEngine interface, so this is one list, not two code
// paths. Groq-only variant: git tag `voice-groq-only` (cherry-pick it).
const ENGINES: SpeechEngine[] = [new BrowserSpeechEngine(), new ServerSpeechEngine()]

/** Languages offered in the mic chip. "auto" lets the server model detect it. */
export const VOICE_LANGS = [
  { code: "auto", tag: "", label: "Auto" },
  { code: "en", tag: "en-US", label: "English" },
  { code: "sl", tag: "sl-SI", label: "Slovenščina" },
  { code: "ru", tag: "ru-RU", label: "Русский" },
  { code: "de", tag: "de-DE", label: "Deutsch" },
  { code: "it", tag: "it-IT", label: "Italiano" },
  { code: "hr", tag: "hr-HR", label: "Hrvatski" },
  { code: "sr", tag: "sr-RS", label: "Srpski" },
  { code: "es", tag: "es-ES", label: "Español" },
  { code: "fr", tag: "fr-FR", label: "Français" },
] as const

export type VoiceLang = (typeof VOICE_LANGS)[number]["code"]

const TAG: Record<string, string> = Object.fromEntries(VOICE_LANGS.map((l) => [l.code, l.tag]))

async function availableEngines(): Promise<SpeechEngine[]> {
  const ok = await Promise.all(ENGINES.map((e) => Promise.resolve(e.available()).catch(() => false)))
  return ENGINES.filter((_, i) => ok[i])
}

/**
 * Click-to-toggle voice input. `lang` is a VOICE_LANGS code; "auto" prefers an
 * engine that detects the language itself (server Whisper) and otherwise falls
 * back to `fallbackLang` (the UI language). Results go to onText.
 */
export function useVoiceInput({
  lang,
  fallbackLang,
  onText,
  onPartial,
  onError,
}: {
  lang: VoiceLang
  fallbackLang: string
  onText: (text: string) => void
  onPartial?: (text: string) => void
  onError?: (message: string) => void
}) {
  const [state, setState] = useState<VoiceState>("idle")
  const [supported, setSupported] = useState(false)
  const engines = useRef<SpeechEngine[]>([])
  const active = useRef<SpeechEngine | null>(null)
  const [engineId, setEngineId] = useState<string | undefined>()
  // Latest callbacks for the engines, updated after each render.
  const cbs = useRef({ onText, onPartial, onError })
  useLayoutEffect(() => {
    cbs.current = { onText, onPartial, onError }
  })
  // run() hands over to the next engine on failure; it calls itself via this ref.
  const runRef = useRef<(index: number, order: SpeechEngine[]) => void>(() => {})

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
    (index: number, order: SpeechEngine[]) => {
      const engine = order[index]
      if (!engine) return
      active.current = engine
      setEngineId(engine.id)
      // Only engines that detect the language get "" (auto); others need a tag.
      const tag = lang === "auto" && !engine.detectsLanguage ? TAG[fallbackLang] || "en-US" : TAG[lang]
      void engine.start(tag, {
        onPartial: (t) => cbs.current.onPartial?.(t),
        onFinal: (t) => cbs.current.onText(t),
        onState: (s) => {
          setState(s)
          if (s === "idle" && active.current === engine) active.current = null
        },
        onError: (message, opts) => {
          if (opts?.fallback && order[index + 1]) {
            runRef.current(index + 1, order) // e.g. browser recognition has no network → record and use the server
            return
          }
          setState("idle")
          cbs.current.onError?.(message)
        },
      })
    },
    [lang, fallbackLang]
  )
  useLayoutEffect(() => {
    runRef.current = run
  }, [run])

  const start = useCallback(() => {
    if (active.current) return
    // Auto: try language-detecting engines first.
    const order =
      lang === "auto"
        ? [...engines.current].sort((a, b) => Number(!!b.detectsLanguage) - Number(!!a.detectsLanguage))
        : engines.current
    run(0, order)
  }, [run, lang])
  const stop = useCallback(() => active.current?.stop(), [])
  const cancel = useCallback(() => active.current?.cancel(), [])
  const toggle = useCallback(() => (active.current ? stop() : start()), [start, stop])

  return { supported, state, start, stop, cancel, toggle, engine: engineId }
}
