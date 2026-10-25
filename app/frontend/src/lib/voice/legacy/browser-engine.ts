/**
 * LEGACY — not used. Kept for reference / quick rollback.
 *
 * Browser Web Speech API (Chrome / Edge / Safari). Replaced by the server
 * engine (Groq Whisper via /api/voice/transcribe): one provider for every
 * browser and in-app WebView, language auto-detection, no audio sent to
 * Google. To turn it back on, add `new BrowserSpeechEngine()` to ENGINES in
 * ../index.ts (before ServerSpeechEngine to make it preferred).
 */
import type { SpeechEngine, VoiceCallbacks } from "../types"

// Minimal typing for the Web Speech API (not in lib.dom for all browsers).
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  start(): void
  stop(): void
  abort(): void
}

function ctor(): (new () => Recognition) | undefined {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => Recognition) | undefined
}

// Errors where trying the server engine makes sense (no network to Google,
// service blocked). "no-speech" / "aborted" are the user's doing, not failures.
const FALLBACK_ERRORS = new Set(["network", "service-not-allowed", "language-not-supported"])

/** @deprecated Legacy, see the note at the top of this file. */
export class BrowserSpeechEngine implements SpeechEngine {
  readonly id = "browser"
  private rec: Recognition | null = null
  private cancelled = false

  available() {
    return !!ctor()
  }

  start(lang: string, cb: VoiceCallbacks) {
    const Rec = ctor()
    if (!Rec) return cb.onError("Speech recognition is not supported here", { fallback: true })
    const rec = new Rec()
    this.rec = rec
    this.cancelled = false
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = false
    let finalText = ""
    rec.onstart = () => cb.onState("recording")
    rec.onresult = (e) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      cb.onPartial?.(finalText + interim)
    }
    rec.onerror = (e) => {
      if (e.error === "aborted" || e.error === "no-speech") return
      cb.onError(e.error, { fallback: FALLBACK_ERRORS.has(e.error) })
    }
    rec.onend = () => {
      this.rec = null
      if (!this.cancelled && finalText.trim()) cb.onFinal(finalText.trim())
      cb.onState("idle")
    }
    rec.start()
  }

  stop() {
    this.rec?.stop()
  }

  cancel() {
    this.cancelled = true
    this.rec?.abort()
  }
}
