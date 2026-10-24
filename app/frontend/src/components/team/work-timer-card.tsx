import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { format } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, StopIcon } from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Card } from "@/components/ui/card"
import { elapsedSeconds, formatClock, plannedEnd, useNow, useWorkTimer } from "@/lib/work-timer"
import { durationLabel } from "@/lib/work-timer-format"
import { cn } from "@/lib/utils"

// 0 = no plan. "custom" turns into a minutes field in place.
const PLANS = [0, 30, 60, 120, 180] as const
const RING = 2 * Math.PI * 36 // circumference of the progress ring (r = 36)

/**
 * Work session: one big start/stop button with a plan ring around it, a
 * large clock beside it, and the plan picked before starting. The ring is
 * the only loud thing in the card; everything else stays quiet.
 */
export function WorkTimerCard() {
  const { t } = useTranslation()
  const timer = useWorkTimer((s) => s.timer)
  const loaded = useWorkTimer((s) => s.loaded)
  const start = useWorkTimer((s) => s.start)
  const extend = useWorkTimer((s) => s.extend)
  const stop = useWorkTimer((s) => s.stop)
  const openDialog = useWorkTimer((s) => s.openDialog)
  const now = useNow(1000)
  const [plan, setPlan] = useState<number | "custom">(0)
  const [custom, setCustom] = useState("60")
  const [busy, setBusy] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error(String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return null

  const customMinutes = Math.min(720, Math.max(1, Math.round(Number(custom) || 0)))
  const chosen = plan === "custom" ? customMinutes : plan

  const running = !!timer
  const elapsed = timer ? elapsedSeconds(timer, now) : 0
  const plannedSec = timer ? timer.planned_minutes * 60 : 0
  const over = plannedSec > 0 && elapsed > plannedSec
  const progress = plannedSec > 0 ? Math.min(1, elapsed / plannedSec) : 0
  const end = timer ? plannedEnd(timer) : null

  let status: string
  if (!timer) {
    status = chosen > 0 ? t("timer.willPlan", { duration: durationLabel(t, chosen) }) : t("timer.noPlanHint")
  } else if (over) {
    status = t("timer.overPlan", { minutes: Math.floor((elapsed - plannedSec) / 60) })
  } else if (end) {
    status = t("timer.endsAt", { duration: durationLabel(t, timer.planned_minutes), time: format(end, "HH:mm") })
  } else {
    status = t("timer.runningOpen")
  }

  const ringColor = over ? "stroke-amber-500" : "stroke-emerald-500"

  return (
    <Card className="gap-0 p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        {/* Start / stop with the plan ring */}
        <div className="relative size-20 shrink-0">
          <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="40" cy="40" r="36" className="fill-none stroke-muted" strokeWidth="4" />
            {running && plannedSec > 0 && (
              <circle
                cx="40"
                cy="40"
                r="36"
                className={cn("fill-none transition-[stroke-dashoffset] duration-1000 ease-linear", ringColor)}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - progress)}
              />
            )}
            {running && plannedSec === 0 && (
              <circle cx="40" cy="40" r="36" className="fill-none stroke-emerald-500/60" strokeWidth="4" />
            )}
          </svg>
          <button
            type="button"
            disabled={busy}
            onClick={() => (running ? openDialog() : run(() => start(chosen)))}
            aria-label={running ? t("timer.stopAndLog") : t("timer.start")}
            className={cn(
              "absolute inset-2 flex items-center justify-center rounded-full text-white shadow-sm transition-colors focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-60",
              running ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-500 hover:bg-emerald-600"
            )}
          >
            <HugeiconsIcon icon={running ? StopIcon : PlayIcon} strokeWidth={2.5} className={cn("size-7", !running && "translate-x-0.5")} />
          </button>
        </div>

        {/* Clock and status */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{t("timer.title")}</p>
          <p
            className={cn(
              "text-4xl leading-tight font-semibold tracking-tight tabular-nums",
              !running && "text-muted-foreground/60",
              over && "text-amber-600 dark:text-amber-400"
            )}
          >
            {formatClock(elapsed)}
          </p>
          <p className={cn("text-sm text-muted-foreground", over && "text-amber-600 dark:text-amber-400")}>{status}</p>
        </div>

        {/* Plan picker before start; quiet actions while running */}
        {!running ? (
          <div className="flex flex-col gap-2">
            <div role="radiogroup" aria-label={t("timer.plan")} className="inline-flex flex-wrap rounded-full border bg-muted/40 p-0.5">
              {PLANS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={plan === m}
                  onClick={() => setPlan(m)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    plan === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m === 0 ? t("timer.noPlan") : durationLabel(t, m)}
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={plan === "custom"}
                onClick={() => setPlan("custom")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  plan === "custom" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("timer.custom")}
              </button>
            </div>
            {plan === "custom" && (
              <label className="flex items-center gap-2 self-end text-xs text-muted-foreground">
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className="h-7 w-16 rounded-md border bg-background px-2 text-right text-sm text-foreground tabular-nums outline-none focus:ring-2 focus:ring-ring"
                  aria-label={t("timer.minutes")}
                  autoFocus
                />
                {t("timer.minutesShort")}
              </label>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => extend(30))}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              {t("timer.plus30")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDiscard(true)}
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
            >
              {t("timer.discard")}
            </button>
          </div>
        )}
      </div>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("timer.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("timer.discardDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(() => stop({ log: false }))}>
              {t("timer.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
