import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  elapsedSeconds,
  formatClock,
  useNow,
  useWorkTimer,
} from "@/lib/work-timer"
import { durationLabel } from "@/lib/work-timer-format"
import { cn } from "@/lib/utils"

const PRESETS = [30, 60, 120, 180]

export function WorkTimerCard() {
  const { t } = useTranslation()
  const timer = useWorkTimer((s) => s.timer)
  const loaded = useWorkTimer((s) => s.loaded)
  const start = useWorkTimer((s) => s.start)
  const extend = useWorkTimer((s) => s.extend)
  const stop = useWorkTimer((s) => s.stop)
  const openDialog = useWorkTimer((s) => s.openDialog)
  const now = useNow(1000)
  const [custom, setCustom] = useState("")
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

  const customMinutes = Math.round(Number(custom))
  const customValid =
    Number.isFinite(customMinutes) && customMinutes >= 1 && customMinutes <= 720

  if (!timer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("timer.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("timer.hint")}</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => run(() => start(0))}>
            {t("timer.start")}
          </Button>
          <span className="px-1 text-sm text-muted-foreground">
            {t("timer.orPlan")}
          </span>
          {PRESETS.map((m) => (
            <Button
              key={m}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => run(() => start(m))}
            >
              {durationLabel(t, m)}
            </Button>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              max={720}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={t("timer.minutes")}
              aria-label={t("timer.minutes")}
              className="h-8 w-24"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !customValid}
              onClick={() => run(() => start(customMinutes))}
            >
              {t("timer.startShort")}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const elapsed = elapsedSeconds(timer, now)
  const plannedSec = timer.planned_minutes * 60
  const over = plannedSec > 0 && elapsed > plannedSec
  const overMin = Math.floor((elapsed - plannedSec) / 60)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("timer.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span
            className={cn(
              "font-mono text-4xl font-semibold tabular-nums",
              over && "text-amber-600 dark:text-amber-400"
            )}
          >
            {formatClock(elapsed)}
          </span>
          {plannedSec > 0 && (
            <span className="text-sm text-muted-foreground">
              {t("timer.ofPlan", {
                duration: formatClock(plannedSec).replace(/:00$/, ""),
              })}
            </span>
          )}
        </div>
        {plannedSec > 0 && (
          <div className="space-y-1">
            <Progress
              value={Math.min(100, (elapsed / plannedSec) * 100)}
              className={cn(
                over &&
                  "bg-amber-500/20 *:data-[slot=progress-indicator]:bg-amber-500"
              )}
            />
            {over && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t("timer.overPlan", { minutes: overMin })}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={openDialog}>
            {t("timer.stopAndLog")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run(() => extend(30))}
          >
            {t("timer.plus30")}
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground"
            disabled={busy}
            onClick={() => setConfirmDiscard(true)}
          >
            {t("timer.discard")}
          </Button>
        </div>
      </CardContent>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("timer.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("timer.discardDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => run(() => stop({ log: false }))}
            >
              {t("timer.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
