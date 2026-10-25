import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/notify"
import { useTree } from "@/components/team/tree-card"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  elapsedSeconds,
  formatClock,
  useNow,
  useWorkTimer,
} from "@/lib/work-timer"
import { durationLabel } from "@/lib/work-timer-format"

const MAX_HOURS = 8

/** Most the server accepts: elapsed rounded up to 15 min (min 15 min), capped at 8 h. */
function maxHours(elapsedSec: number) {
  return Math.min(MAX_HOURS, Math.max(0.25, Math.ceil((elapsedSec / 3600) * 4) / 4))
}

function suggestedHours(elapsedSec: number) {
  const rounded = Math.round((elapsedSec / 3600) * 4) / 4
  return Math.min(maxHours(elapsedSec), Math.max(0.25, rounded))
}


export function StopTimerDialog() {
  const { t } = useTranslation()
  const timer = useWorkTimer((s) => s.timer)
  const open = useWorkTimer((s) => s.dialogOpen)
  const closeDialog = useWorkTimer((s) => s.closeDialog)
  const stop = useWorkTimer((s) => s.stop)
  const now = useNow(1000)
  const [hours, setHours] = useState(0.25)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const elapsed = timer ? elapsedSeconds(timer, now) : 0
  const isOpen = open && !!timer

  useEffect(() => {
    if (isOpen) {
      const current = useWorkTimer.getState().timer
      if (current) {
        setHours(suggestedHours(elapsedSeconds(current, Date.now())))
      }
      setNote("")
    }
  }, [isOpen])

  const limit = maxHours(elapsed)
  const parsed = Math.min(hours, limit)
  const valid = parsed >= 0.25

  const finish = async (log: boolean) => {
    setBusy(true)
    try {
      const res = await stop(
        log ? { log: true, hours: parsed, note: note.trim() } : { log: false }
      )
      if (log) {
        notify.success(t("timer.logged", { hours: durationLabel(t, Math.round((res.hours ?? parsed) * 60)) }))
        window.dispatchEvent(new Event("hours-changed"))
        const earned = (res as { drops_earned?: number }).drops_earned
        if (earned) {
          notify.success(t("tree.earned", { count: earned }))
          void useTree.getState().load()
        }
      } else {
        notify.message(t("timer.discarded"))
      }
    } catch (e) {
      notify.error(String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("timer.stopTitle")}</DialogTitle>
          <DialogDescription>
            {t("timer.elapsed")}:{" "}
            <span className="font-medium text-foreground tabular-nums">{formatClock(elapsed)}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {elapsed > MAX_HOURS * 3600 && (
            <p className="rounded-md bg-amber-500/10 p-2 text-sm text-amber-600 dark:text-amber-400">
              {t("timer.leftRunning")}
            </p>
          )}
          <div className="space-y-1.5">
            <Label>{t("timer.hours")}</Label>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center rounded-full border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setHours(Math.max(0.25, parsed - 0.25))}
                  disabled={parsed <= 0.25}
                  className="flex size-8 items-center justify-center rounded-full text-lg text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"
                  aria-label={t("timer.less")}
                >
                  −
                </button>
                <span className="min-w-24 text-center text-lg font-semibold tabular-nums" aria-live="polite">
                  {durationLabel(t, Math.round(parsed * 60))}
                </span>
                <button
                  type="button"
                  onClick={() => setHours(Math.min(limit, parsed + 0.25))}
                  disabled={parsed >= limit}
                  className="flex size-8 items-center justify-center rounded-full text-lg text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"
                  aria-label={t("timer.more")}
                >
                  +
                </button>
              </div>
              <span className="text-xs text-muted-foreground">{t("timer.upTo", { hours: durationLabel(t, Math.round(limit * 60)) })}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timer-note">{t("timer.note")}</Label>
            <Input
              id="timer-note"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("timer.notePlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void finish(false)}
          >
            {t("timer.discard")}
          </Button>
          <Button disabled={busy || !valid} onClick={() => void finish(true)}>
            {t("timer.logHours")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
