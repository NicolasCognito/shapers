import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import {
  elapsedSeconds,
  formatClock,
  useNow,
  useWorkTimer,
} from "@/lib/work-timer"

export function TimerPill() {
  const { t } = useTranslation()
  const timer = useWorkTimer((s) => s.timer)
  const openDialog = useWorkTimer((s) => s.openDialog)
  const now = useNow(1000)
  if (!timer) return null
  const elapsed = elapsedSeconds(timer, now)
  const paused = !!timer.paused_at
  const over = !paused && timer.planned_minutes > 0 && elapsed > timer.planned_minutes * 60
  return (
    <button
      type="button"
      onClick={openDialog}
      title={t("timer.stopAndLog")}
      className={cn(
        "mr-1 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 font-mono text-xs tabular-nums transition-colors",
        paused
          ? "bg-muted text-muted-foreground hover:bg-muted/70"
          : over
          ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-400"
          : "bg-muted text-foreground hover:bg-muted/70"
      )}
    >
      <span aria-hidden>{paused ? "⏸" : "⏱"}</span>
      {formatClock(elapsed)}
    </button>
  )
}
