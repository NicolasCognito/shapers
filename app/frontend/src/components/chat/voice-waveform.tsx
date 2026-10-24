import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

const BARS = 48
const STEP_MS = 60 // a new bar enters from the right this often
const MIN = 0.12 // bars never collapse fully, so the strip is visible in silence

/**
 * Scrolling microphone level bars (voice-memo style) shown in the chat input
 * while dictating. Opens its own mic stream, so it works with any speech
 * engine. While the server transcribes it shows a calm travelling wave.
 */
export function VoiceWaveform({ state }: { state: "recording" | "processing" }) {
  const { t } = useTranslation()
  const bars = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    let raf = 0
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let alive = true
    const levels = new Array<number>(BARS).fill(MIN)
    const paint = () =>
      bars.current.forEach((el, i) => {
        if (el) el.style.transform = `scaleY(${levels[i]})`
      })

    if (state === "processing") {
      const t0 = performance.now()
      const loop = () => {
        const tt = (performance.now() - t0) / 1000
        for (let i = 0; i < BARS; i++) levels[i] = 0.3 + 0.22 * Math.sin(tt * 5 - i * 0.35)
        paint()
        raf = requestAnimationFrame(loop)
      }
      loop()
      return () => cancelAnimationFrame(raf)
    }

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then(async (s) => {
        if (!alive) return s.getTracks().forEach((tr) => tr.stop())
        stream = s
        ctx = new AudioContext()
        // Created after an await, so browsers may start it suspended.
        if (ctx.state === "suspended") await ctx.resume().catch(() => {})
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        ctx.createMediaStreamSource(s).connect(analyser)
        const data = new Uint8Array(analyser.fftSize)
        let last = performance.now()
        let peak = 0
        const loop = (now: number) => {
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (const v of data) sum += (v - 128) * (v - 128)
          const rms = Math.sqrt(sum / data.length) / 128 // 0..~1, speech ≈ 0.05–0.3
          peak = Math.max(peak, rms)
          if (now - last >= STEP_MS) {
            levels.shift()
            levels.push(Math.min(1, MIN + Math.sqrt(peak) * 1.6))
            peak = 0
            last = now
            paint()
          }
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
      })
      .catch(() => {
        /* no mic access: the engine reports it */
      })

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((tr) => tr.stop())
      void ctx?.close()
    }
  }, [state])

  return (
    <div className="flex w-full basis-full items-center gap-3 self-stretch px-3 pt-3" aria-live="polite">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          state === "recording" ? "animate-pulse bg-rose-500" : "bg-emerald-500"
        )}
      />
      <div className="flex h-8 min-w-0 flex-1 items-center justify-between gap-[3px]" aria-hidden>
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              bars.current[i] = el
            }}
            className={cn(
              "h-full w-[3px] origin-center rounded-full transition-transform duration-100 ease-out",
              state === "recording" ? "bg-rose-500" : "bg-emerald-500/80"
            )}
            style={{ transform: `scaleY(${MIN})` }}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {state === "recording" ? t("chat.voice.listening") : t("chat.voice.processing")}
      </span>
    </div>
  )
}
