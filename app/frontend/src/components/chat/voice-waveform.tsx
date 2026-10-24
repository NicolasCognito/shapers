import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

const BARS = 40

/**
 * Live microphone level bars shown in the chat input while dictating.
 * Opens its own mic stream, so it works with any speech engine. While the
 * server transcribes ("processing") it shows a calm travelling wave instead.
 */
export function VoiceWaveform({ state }: { state: "recording" | "processing" }) {
  const { t } = useTranslation()
  const bars = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    let raf = 0
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let alive = true
    const set = (levels: (i: number) => number) => {
      bars.current.forEach((el, i) => {
        if (el) el.style.transform = `scaleY(${Math.max(0.08, Math.min(1, levels(i)))})`
      })
    }

    if (state === "processing") {
      const t0 = performance.now()
      const loop = () => {
        const tt = (performance.now() - t0) / 1000
        set((i) => 0.25 + 0.2 * Math.sin(tt * 4 + i * 0.45))
        raf = requestAnimationFrame(loop)
      }
      loop()
      return () => cancelAnimationFrame(raf)
    }

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((tr) => tr.stop())
        stream = s
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.7
        ctx.createMediaStreamSource(s).connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)
        const loop = () => {
          analyser.getByteFrequencyData(data)
          // Voice sits in the lower bins; mirror around the centre for a symmetric look.
          const half = BARS / 2
          set((i) => {
            const k = Math.abs(i - half + 0.5)
            const bin = Math.floor((k / half) * data.length * 0.5)
            return (data[bin] / 255) * 1.4
          })
          raf = requestAnimationFrame(loop)
        }
        loop()
      })
      .catch(() => {
        /* no mic access: the engine will report it */
      })

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((tr) => tr.stop())
      void ctx?.close()
    }
  }, [state])

  return (
    <div className="flex items-center gap-3 px-3 pt-3" aria-live="polite">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          state === "recording" ? "animate-pulse bg-rose-500" : "bg-emerald-500"
        )}
      />
      <div className="flex h-8 flex-1 items-center gap-[3px]" aria-hidden>
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              bars.current[i] = el
            }}
            className={cn(
              "h-full flex-1 origin-center rounded-full transition-transform duration-75",
              state === "recording" ? "bg-rose-500/70" : "bg-emerald-500/60"
            )}
            style={{ transform: "scaleY(0.08)" }}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {state === "recording" ? t("chat.voice.listening") : t("chat.voice.processing")}
      </span>
    </div>
  )
}
