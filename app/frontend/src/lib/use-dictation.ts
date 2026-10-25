import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/notify"

import { useVoiceInput, VOICE_LANGS, type VoiceLang } from "@/lib/voice"

const LANG_KEY = "shapers.voiceLang"

function readLang(): VoiceLang {
  try {
    const v = localStorage.getItem(LANG_KEY)
    if (v && VOICE_LANGS.some((l) => l.code === v)) return v as VoiceLang
  } catch {
    /* per-browser convenience only */
  }
  return "auto"
}

/**
 * Dictation into the chat input. The spoken language is picked separately
 * from the UI language ("auto" lets Whisper detect it). Dictated text is
 * appended to what is already typed; the person sends it themselves.
 */
export function useDictation({ text, setText }: { text: string; setText: (text: string) => void }) {
  const { t, i18n } = useTranslation()
  const [lang, setLangState] = useState<VoiceLang>(readLang)
  const base = useRef("")
  const join = (spoken: string) => (base.current ? `${base.current} ${spoken}` : spoken)

  const voice = useVoiceInput({
    lang,
    fallbackLang: i18n.language?.startsWith("sl") ? "sl" : "en",
    onPartial: (s) => setText(join(s)),
    onText: (s) => setText(join(s)),
    onError: (m) => notify.error(t("chat.voice.error", { message: m })),
  })

  const { start: voiceStart, toggle: voiceToggle, state } = voice
  const start = useCallback(() => {
    base.current = text.trim()
    voiceStart()
  }, [voiceStart, text])
  const toggle = useCallback(() => {
    if (state === "idle") base.current = text.trim()
    voiceToggle()
  }, [state, voiceToggle, text])

  const setLang = (code: VoiceLang) => {
    setLangState(code)
    try {
      localStorage.setItem(LANG_KEY, code)
    } catch {
      /* ignore */
    }
  }

  return { supported: voice.supported, state, start, toggle, lang, setLang }
}

export type Dictation = ReturnType<typeof useDictation>

/** Best guess before the engines load: can this browser take voice at all? */
export function voiceLikelySupported() {
  const w = window as unknown as Record<string, unknown>
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition || navigator.mediaDevices?.getUserMedia)
}
