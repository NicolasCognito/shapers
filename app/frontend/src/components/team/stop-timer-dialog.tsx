import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

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

const MAX_HOURS = 8

function suggestedHours(elapsedSec: number) {
  const rounded = Math.round((elapsedSec / 3600) * 4) / 4
  return Math.min(MAX_HOURS, Math.max(0.25, rounded))
}

export function StopTimerDialog() {
  const { t } = useTranslation()
  const timer = useWorkTimer((s) => s.timer)
  const open = useWorkTimer((s) => s.dialogOpen)
  const closeDialog = useWorkTimer((s) => s.closeDialog)
  const stop = useWorkTimer((s) => s.stop)
  const now = useNow(1000)
  const [hours, setHours] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const elapsed = timer ? elapsedSeconds(timer, now) : 0
  const isOpen = open && !!timer

  useEffect(() => {
    if (isOpen) {
      const current = useWorkTimer.getState().timer
      if (current) {
        setHours(String(suggestedHours(elapsedSeconds(current, Date.now()))))
      }
      setNote("")
    }
  }, [isOpen])

  const parsed = Number(hours.replace(",", "."))
  const valid = Number.isFinite(parsed) && parsed >= 0.25 && parsed <= MAX_HOURS

  const finish = async (log: boolean) => {
    setBusy(true)
    try {
      const res = await stop(
        log ? { log: true, hours: parsed, note: note.trim() } : { log: false }
      )
      if (log) {
        toast.success(t("timer.logged", { hours: res.hours ?? parsed }))
        window.dispatchEvent(new Event("hours-changed"))
      } else {
        toast(t("timer.discarded"))
      }
    } catch (e) {
      toast.error(String((e as Error)?.message ?? e))
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
            <span className="font-mono">{formatClock(elapsed)}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {elapsed > MAX_HOURS * 3600 && (
            <p className="rounded-md bg-amber-500/10 p-2 text-sm text-amber-600 dark:text-amber-400">
              {t("timer.leftRunning")}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="timer-hours">{t("timer.hours")}</Label>
            <Input
              id="timer-hours"
              type="number"
              inputMode="decimal"
              min={0.25}
              max={MAX_HOURS}
              step={0.25}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
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
