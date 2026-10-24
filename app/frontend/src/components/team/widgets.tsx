import { format, parseISO } from "date-fns"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { useDateLocale } from "@/i18n"
import { cn } from "@/lib/utils"
import {
  STATE_CLASS,
  fmtHours,
  pct,
  type AttendanceState,
  type AttendanceStats,
  type MeetingView,
} from "@/lib/team"

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: "good" | "warn" | "bad"
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-rose-600 dark:text-rose-400"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Hours per week as bars, with the tier quota drawn as a dashed line. */
export function WeekBars({
  weeks,
  height = 120,
}: {
  weeks: { week_start: string; hours: number; quota: number; met?: boolean }[]
  height?: number
}) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.hours, w.quota))) * 1.1
  const quota = weeks[weeks.length - 1]?.quota ?? 0
  return (
    <div>
      <div className="relative flex items-end gap-2" style={{ height }}>
        {quota > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/30"
            style={{ bottom: (quota / max) * height }}
          >
            <span className="absolute -top-4 right-0 text-[10px] text-muted-foreground">
              {t("widgets.goal", { hours: fmtHours(quota) })}
            </span>
          </div>
        )}
        {weeks.map((w, i) => {
          const current = i === weeks.length - 1
          const met = w.quota > 0 ? w.hours >= w.quota : false
          return (
            <div
              key={w.week_start}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height }}
              title={`${format(parseISO(w.week_start), "d MMM", { locale })}: ${fmtHours(w.hours)}`}
            >
              <span className="mb-1 text-[10px] whitespace-nowrap tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100">
                {fmtHours(w.hours)}
              </span>
              <div
                className={cn(
                  "w-full max-w-10 rounded-t-md transition-all",
                  met ? "bg-emerald-500" : current ? "bg-primary/70" : "bg-primary/35"
                )}
                style={{ height: Math.max(2, (w.hours / max) * height) }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {weeks.map((w, i) => (
          <span
            key={w.week_start}
            className="flex-1 text-center text-[10px] text-muted-foreground"
          >
            {i === weeks.length - 1
              ? t("widgets.thisWk")
              : format(parseISO(w.week_start), "d MMM", { locale })}
          </span>
        ))}
      </div>
    </div>
  )
}

export function StateBadge({ state }: { state: AttendanceState | "" }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATE_CLASS[state]
      )}
    >
      {t(`common.state.${state || "none"}`)}
    </span>
  )
}

export function AttendanceBreakdown({ stats }: { stats: AttendanceStats }) {
  const { t } = useTranslation()
  const total =
    stats.present + stats.remote + stats.excused + stats.unexcused + stats.unmarked
  const parts: [AttendanceState | "", number][] = [
    ["present", stats.present],
    ["remote", stats.remote],
    ["excused", stats.excused],
    ["unexcused", stats.unexcused],
    ["", stats.unmarked],
  ]
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          parts.map(([s, n]) =>
            n > 0 ? (
              <div
                key={s || "none"}
                className={cn(STATE_CLASS[s], "h-full")}
                style={{ width: `${(n / total) * 100}%`, opacity: 1 }}
              />
            ) : null
          )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {parts.map(([s, n]) =>
          n > 0 ? (
            <span key={s || "none"}>
              {t(`common.state.${s || "none"}`)}: <b className="text-foreground">{n}</b>
            </span>
          ) : null
        )}
        <span className="ml-auto">
          {t("widgets.showedUp")}{" "}
          <b className="text-foreground">{pct(stats.rate)}</b>
        </span>
      </div>
    </div>
  )
}

export function MeetingRow({
  m,
  action,
}: {
  m: MeetingView
  action?: ReactNode
}) {
  const locale = useDateLocale()
  const start = parseISO(m.start)
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="w-12 shrink-0 text-center">
        <p className="text-[10px] uppercase text-muted-foreground">{format(start, "EEE", { locale })}</p>
        <p className="text-lg font-semibold leading-none">{format(start, "d")}</p>
        <p className="text-[10px] text-muted-foreground">{format(start, "MMM", { locale })}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{m.title}</p>
        <p className="text-xs text-muted-foreground">
          {format(start, "HH:mm")}–{format(parseISO(m.end), "HH:mm")} · {m.series}
        </p>
      </div>
      {action ?? <StateBadge state={m.state} />}
    </div>
  )
}

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        tier === "Core" && "bg-violet-500/15 text-violet-700 dark:text-violet-300",
        tier === "Impact" && "bg-sky-500/15 text-sky-700 dark:text-sky-300",
        tier === "GO!" && "bg-lime-500/20 text-lime-700 dark:text-lime-300"
      )}
    >
      {tier}
    </span>
  )
}

export function ProgressBar({
  value,
  marker,
  className,
}: {
  value: number
  marker?: number
  className?: string
}) {
  const { t } = useTranslation()
  const v = Math.min(1, value)
  return (
    <div className={cn("relative h-2 rounded-full bg-muted", className)}>
      <div
        className={cn(
          "h-full rounded-full",
          value >= 1 ? "bg-emerald-500" : marker !== undefined && value < marker ? "bg-amber-500" : "bg-primary"
        )}
        style={{ width: `${v * 100}%` }}
      />
      {marker !== undefined && marker < 1 && (
        <div
          className="absolute -top-0.5 h-3 w-0.5 rounded bg-foreground/50"
          style={{ left: `${marker * 100}%` }}
          title={t("widgets.paceMarker")}
        />
      )}
    </div>
  )
}
