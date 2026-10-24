import { pb } from "@/lib/pocketbase"

import type { SpeechEngine, VoiceCallbacks } from "./types"

// Records audio and sends it to our server (/api/voice/transcribe). Which
// provider transcribes it (Groq Whisper, OpenAI, self-hosted...) is decided on
// the server, so the API key never reaches the browser. Works anywhere
// MediaRecorder works, including in-app WebViews.

let configPromise: Promise<boolean> | null = null

function serverEnabled(): Promise<boolean> {
  configPromise ??= pb
    .send<{ server: boolean }>("/api/voice/config", {})
    .then((c) => c.server)
    .catch(() => false)
  return configPromise
}

// Pick a container the browser can record and Whisper can read.
function pickMime(): string {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported?.(m)) return m
  }
  return ""
}

const EXT: Record<string, string> = { webm: "webm", mp4: "m4a", ogg: "ogg" }

export class ServerSpeechEngine implements SpeechEngine {
  readonly id = "server"
  readonly detectsLanguage = true
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private cancelled = false

  async available() {
    return typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia && (await serverEnabled())
  }

  async start(lang: string, cb: VoiceCallbacks) {
    this.cancelled = false
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return cb.onError("Microphone access was denied")
    }
    const mime = pickMime()
    const recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
    this.recorder = recorder
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    recorder.onstart = () => cb.onState("recording")
    recorder.onstop = async () => {
      this.release()
      if (this.cancelled || chunks.length === 0) return cb.onState("idle")
      cb.onState("processing")
      const type = recorder.mimeType || mime || "audio/webm"
      const ext = EXT[type.split("/")[1]?.split(";")[0] ?? ""] ?? "webm"
      const form = new FormData()
      form.append("audio", new Blob(chunks, { type }), `speech.${ext}`)
      if (lang) form.append("lang", lang.split("-")[0])
      try {
        const res = await pb.send<{ text: string }>("/api/voice/transcribe", { method: "POST", body: form })
        if (res.text) cb.onFinal(res.text)
      } catch (e) {
        cb.onError(e instanceof Error ? e.message : "Transcription failed")
      } finally {
        cb.onState("idle")
      }
    }
    recorder.start()
  }

  stop() {
    if (this.recorder?.state === "recording") this.recorder.stop()
  }

  cancel() {
    this.cancelled = true
    this.stop()
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.recorder = null
  }
}
