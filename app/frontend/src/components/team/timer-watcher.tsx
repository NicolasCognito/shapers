import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/notify"

import { StopTimerDialog } from "@/components/team/stop-timer-dialog"
import {
  elapsedSeconds,
  useNow,
  useTimerSync,
  useWorkTimer,
} from "@/lib/work-timer"
import { durationLabel } from "@/lib/work-timer-format"

/** Mounted once in the dashboard layout: syncs the timer, fires the planned-end alert, hosts the stop dialog. */
export function TimerWatcher() {
  const { t } = useTranslation()
  const timer = useWorkTimer((s) => s.timer)
  const now = useNow(1000)
  useTimerSync()

  useEffect(() => {
    if (!timer || !timer.planned_minutes) return
    if (elapsedSeconds(timer, now) < timer.planned_minutes * 60) return
    const key = `work-timer-notified:${timer.id}:${timer.planned_minutes}`
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, "1")
    } catch {
      // storage unavailable: may notify again after reload
    }
    const text = t("timer.planUp", {
      duration: durationLabel(t, timer.planned_minutes),
    })
    notify.message(text, {
      duration: Infinity,
      action: {
        label: t("timer.logNow"),
        onClick: () => useWorkTimer.getState().openDialog(),
      },
      cancel: {
        label: t("timer.plus30"),
        onClick: () => {
          useWorkTimer
            .getState()
            .extend(30)
            .catch((e) => notify.error(String(e?.message ?? e)))
        },
      },
    })
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const n = new Notification("Shapers", { body: text })
        n.onclick = () => {
          window.focus()
          n.close()
        }
      } catch {
        // ignore
      }
    }
  }, [timer, now, t])

  return <StopTimerDialog />
}
