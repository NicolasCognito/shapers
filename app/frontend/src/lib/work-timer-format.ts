import type { TFunction } from "i18next"

/** "30 min", "2 h", "1 h 30 min" */
export function durationLabel(t: TFunction, minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return t("timer.durMin", { m })
  if (m === 0) return t("timer.durH", { h })
  return t("timer.durHM", { h, m })
}
