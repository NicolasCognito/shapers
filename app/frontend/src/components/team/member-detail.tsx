import { useEffect, useState } from "react"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  AttendanceBreakdown,
  MeetingRow,
  ProgressBar,
  StateBadge,
  TierBadge,
  WeekBars,
} from "@/components/team/widgets"
import { useDateLocale } from "@/i18n"
import { extractErrorMessage } from "@/lib/error"
import { can } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { LogDatePicker } from "@/components/team/log-date-picker"
import {
  fmtHours,
  pct,
  requestsApi,
  selfLogAllowed,
  STATE_CLASS,
  teamApi,
  type HourLog,
  type MeetingView,
  type MemberDetail,
} from "@/lib/team"

const QUICK_HOURS = [0.5, 1, 2, 4, 8]

export function MemberDetailView({
  detail,
  editable,
  canModerate = false,
  onChanged,
}: {
  detail: MemberDetail
  editable: boolean
  canModerate?: boolean
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const restoreTask = async (id: string) => {
    try {
      await requestsApi.restoreTask(id)
      toast.success(t("memberDetail.restored"))
      onChanged()
    } catch (e) {
      toast.error(extractErrorMessage(e, t("memberDetail.restoreFailed")))
    }
  }
  const cancelTask = async (id: string, title: string) => {
    const reason = window.prompt(t("memberDetail.cancelPrompt", { title }))
    if (!reason?.trim()) return
    try {
      await requestsApi.cancelTask(id, reason.trim())
      toast.success(t("memberDetail.cancelled"))
      onChanged()
    } catch (e) {
      toast.error(extractErrorMessage(e, t("memberDetail.cancelFailed")))
    }
  }
  const s = detail.summary
  const past = detail.past ?? []
  const upcoming = detail.upcoming ?? []
  const openNow = upcoming.concat(past).filter((m) => m.can_check_in)

  return (
    <div className="@container">
      <div className="grid gap-4 @3xl:grid-cols-3">
        {/* This week */}
        <Card className="@3xl:col-span-2" data-tour="this-week">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("memberDetail.thisWeek")} <TierBadge tier={s.tier} />
            </CardTitle>
            <CardDescription>
              {t("memberDetail.commitment", {
                tier: s.tier,
                hours: fmtHours(s.weekly_hours),
              })}
              {s.pause && (
                <span className="ml-2 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-700 dark:text-sky-300">
                  ⏸ {t(s.paused ? "rules.onPauseFromTo" : "rules.pausePlanned", {
                    from: format(parseISO(s.pause.start), "d MMM", { locale }),
                    to: format(parseISO(s.pause.end), "d MMM", { locale }),
                  })}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <span className="text-4xl font-semibold tabular-nums">
                {fmtHours(s.this_week)}
              </span>
              <span className="pb-1 text-muted-foreground">
                {t("memberDetail.ofGoal", { hours: fmtHours(s.weekly_hours) })}
              </span>
              <span
                className={
                  "ml-auto pb-1 text-sm font-medium " +
                  (s.progress >= 1
                    ? "text-emerald-600 dark:text-emerald-400"
                    : s.paused
                      ? "text-sky-600 dark:text-sky-400"
                      : s.behind
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground")
                }
              >
                {s.progress >= 1
                  ? t("memberDetail.goalReached")
                  : s.paused
                    ? t("rules.pausedNoPressure")
                    : s.behind
                    ? t("memberDetail.behindPace", {
                        hours: fmtHours(Math.max(0, s.expected - s.this_week)),
                      })
                    : t("memberDetail.onTrack")}
              </span>
            </div>
            <ProgressBar
              value={s.progress}
              marker={s.weekly_hours ? s.expected / s.weekly_hours : undefined}
            />
            {editable && <QuickLog userId={s.id} onLogged={onChanged} />}
          </CardContent>
        </Card>

        {/* Streak + clock-in */}
        <Card>
          <CardHeader>
            <CardTitle>{t("memberDetail.streak")}</CardTitle>
            <CardDescription>
              {t("memberDetail.streakDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-4xl font-semibold">
              {s.streak > 0 ? "🔥" : "🌱"} {s.streak}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                {t("memberDetail.weeks", { count: s.streak })}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-xs text-muted-foreground">
                  {t("memberDetail.showedUp")}
                </p>
                <p className="font-semibold">{pct(s.attendance.rate)}</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-xs text-muted-foreground">
                  {t("memberDetail.tasksDone")}
                </p>
                <p className="font-semibold">{s.tasks_done}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {editable && openNow.length > 0 && (
          <Card className="border-primary/40 bg-primary/5 @3xl:col-span-3">
            <CardHeader>
              <CardTitle>{t("memberDetail.clockIn")}</CardTitle>
              <CardDescription>{t("memberDetail.clockInDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {openNow.map((m) => (
                <MeetingRow
                  key={m.id}
                  m={m}
                  action={
                    <CheckinButtons
                      meetingId={m.id}
                      state={m.state}
                      onDone={onChanged}
                    />
                  }
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Hours history */}
        <Card className="@3xl:col-span-2">
          <CardHeader>
            <CardTitle>{t("memberDetail.hoursHistory")}</CardTitle>
            <CardDescription>
              {t("memberDetail.hoursHistoryDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WeekBars weeks={s.weeks} height={140} />
            <RecentLogs
              userId={s.id}
              editable={editable}
              onChanged={onChanged}
              refreshKey={detail}
            />
          </CardContent>
        </Card>

        {/* Upcoming */}
        <Card data-tour="meetings">
          <CardHeader>
            <CardTitle>{t("memberDetail.nextMeetings")}</CardTitle>
            <CardDescription>{t("memberDetail.nextMeetingsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("memberDetail.noUpcoming")}
              </p>
            )}
            {upcoming.slice(0, 5).map((m) => (
              <MeetingRow
                key={m.id}
                m={m}
                action={
                  editable ? (
                    <AbsenceAction m={m} tier={s.tier} onDone={onChanged} />
                  ) : m.notice ? (
                    <NoticeBadge m={m} />
                  ) : (
                    <span />
                  )
                }
              />
            ))}
          </CardContent>
        </Card>

        <RulesCard detail={detail} editable={editable} onChanged={onChanged} />

        {/* Finished tasks */}
        <Card className="@3xl:col-span-3">
          <CardHeader>
            <CardTitle>
              {t("memberDetail.finishedTasks", {
                count: (detail.tasks_done ?? []).filter((tk) => !tk.cancelled)
                  .length,
              })}
            </CardTitle>
            <CardDescription>
              {t("memberDetail.finishedTasksDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(detail.tasks_done ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("memberDetail.noFinished")}
              </p>
            ) : (
              <div className="max-h-64 divide-y overflow-y-auto text-sm">
                {detail.tasks_done.map((tk) => (
                  <div key={tk.id} className="flex items-center gap-3 py-1.5">
                    <span className="w-16 shrink-0 text-muted-foreground">
                      {format(parseISO(tk.done_at.replace(" ", "T")), "d MMM", {
                        locale,
                      })}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        tk.cancelled && "text-muted-foreground line-through"
                      )}
                      title={
                        tk.cancelled
                          ? t("memberDetail.cancelledReasonTitle", {
                              reason: tk.cancel_reason,
                            })
                          : undefined
                      }
                    >
                      {tk.title}
                    </span>
                    {tk.cancelled ? (
                      <span className="truncate text-xs text-rose-600 dark:text-rose-400">
                        {tk.cancel_reason
                          ? t("memberDetail.cancelledLabelReason", {
                              reason: tk.cancel_reason,
                            })
                          : t("memberDetail.cancelledLabel")}
                      </span>
                    ) : (
                      <span className="truncate text-xs text-muted-foreground">
                        {tk.project}
                      </span>
                    )}
                    {canModerate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() =>
                          tk.cancelled ? restoreTask(tk.id) : cancelTask(tk.id, tk.title)
                        }
                      >
                        {tk.cancelled
                          ? t("memberDetail.restore")
                          : t("memberDetail.cancel")}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance */}
        <Card className="@3xl:col-span-3">
          <CardHeader>
            <CardTitle>{t("memberDetail.attendance")}</CardTitle>
            <CardDescription>
              {t("memberDetail.attendanceDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 @3xl:grid-cols-2">
            <div className="space-y-4">
              <AttendanceBreakdown stats={s.attendance} />
              <div className="space-y-2">
                {Object.entries(s.by_series ?? {}).map(([series, st]) => (
                  <div key={series} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0 truncate">{series}</span>
                    <ProgressBar value={st.rate} className="flex-1" />
                    <span className="w-10 text-right text-muted-foreground tabular-nums">
                      {pct(st.rate)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="max-h-80 divide-y overflow-y-auto pr-1">
              {past.map((m) => (
                <MeetingRow key={m.id} m={m} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function QuickLog({
  userId,
  onLogged,
}: {
  userId: string
  onLogged: () => void
}) {
  const { t } = useTranslation()
  const [hours, setHours] = useState<number | "">("")
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const asRequest = !selfLogAllowed(date)
  const submit = async (h: number) => {
    if (!h || h <= 0) return
    setBusy(true)
    try {
      if (asRequest) {
        await requestsApi.hours(date, h, note.trim())
        toast.success(t("memberDetail.requestSent"))
        setHours("")
        setNote("")
        return
      }
      await teamApi.logHours(
        userId,
        parseISO(date + "T12:00:00"),
        h,
        note.trim()
      )
      toast.success(t("memberDetail.logged", { hours: fmtHours(h) }))
      setHours("")
      setNote("")
      onLogged()
    } catch (e) {
      toast.error(extractErrorMessage(e, t("common.somethingWrong")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
      <p className="text-sm font-medium">{t("memberDetail.logHours")}</p>
      <div className="flex flex-wrap gap-2">
        {QUICK_HOURS.map((h) => (
          <Button
            key={h}
            size="sm"
            variant="secondary"
            disabled={busy || (asRequest && !note.trim())}
            onClick={() => submit(h)}
          >
            +{h}h
          </Button>
        ))}
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit(Number(hours))
        }}
      >
        <Input
          type="number"
          step="0.25"
          min="0.25"
          placeholder={t("memberDetail.hoursPlaceholder")}
          className="w-24"
          value={hours}
          onChange={(e) =>
            setHours(e.target.value === "" ? "" : Number(e.target.value))
          }
        />
        <LogDatePicker className="w-36" value={date} onChange={setDate} />
        <Input
          placeholder={t("memberDetail.notePlaceholder")}
          className="min-w-40 flex-1"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          disabled={busy || !hours || (asRequest && !note.trim())}
        >
          {asRequest ? t("memberDetail.sendRequest") : t("memberDetail.log")}
        </Button>
        {asRequest && (
          <p className="w-full text-xs text-muted-foreground">
            {t("memberDetail.olderNote")}
          </p>
        )}
      </form>
    </div>
  )
}

function RecentLogs({
  userId,
  editable,
  onChanged,
  refreshKey,
}: {
  userId: string
  editable: boolean
  onChanged: () => void
  refreshKey: unknown
}) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const [logs, setLogs] = useState<HourLog[]>([])
  const [tick, setTick] = useState(0)
  const isHoursAdmin = !editable && can("hours.manage")
  useEffect(() => {
    teamApi
      .myLogs(userId)
      .then((r) => setLogs(r.items))
      .catch(() => setLogs([]))
  }, [userId, tick, refreshKey])

  if (logs.length === 0) return null
  return (
    <div className="mt-4 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        {t("memberDetail.recentEntries")}
      </p>
      <div className="max-h-48 divide-y overflow-y-auto text-sm">
        {logs.map((l) => (
          <div key={l.id} className="flex items-center gap-3 py-1.5">
            <span className="w-20 shrink-0 text-muted-foreground">
              {format(parseISO(l.date), "d MMM", { locale })}
            </span>
            <span className="w-14 shrink-0 font-medium tabular-nums">
              {fmtHours(l.hours)}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {l.note}
            </span>
            {((editable && l.source !== "import") || isHoursAdmin) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={async () => {
                  if (
                    !editable &&
                    !window.confirm(
                      t("memberDetail.confirmDeleteHours", {
                        hours: fmtHours(l.hours),
                        date: format(parseISO(l.date), "d MMM", { locale }),
                      })
                    )
                  )
                    return
                  try {
                    await teamApi.deleteLog(l.id)
                    setTick((t) => t + 1)
                    onChanged()
                  } catch (e) {
                    toast.error(extractErrorMessage(e, t("memberDetail.deleteFailed")))
                  }
                }}
              >
                {editable ? t("memberDetail.undo") : t("memberDetail.deleteHours")}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function CheckinButtons({
  meetingId,
  state,
  onDone,
}: {
  meetingId: string
  state: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  if (state === "present" || state === "remote") {
    return <StateBadge state={state} />
  }
  const go = async (remote: boolean) => {
    setBusy(true)
    try {
      await teamApi.checkin(meetingId, remote)
      toast.success(
        remote ? t("memberDetail.joinedRemote") : t("memberDetail.youreIn")
      )
      onDone()
    } catch (e) {
      toast.error(extractErrorMessage(e, t("common.somethingWrong")))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={busy} onClick={() => go(false)}>
        {t("memberDetail.imHere")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => go(true)}
      >
        {t("memberDetail.remote")}
      </Button>
    </div>
  )
}

// ---------- tier rules: absence notice, Community, pause ----------

function NoticeBadge({ m }: { m: MeetingView }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn("rounded-md px-2 py-0.5 text-xs whitespace-nowrap", STATE_CLASS[m.state])}
      title={m.notice}
    >
      {m.notice_late ? t("rules.lateNotice") : t("rules.notComing")}
    </span>
  )
}

function AbsenceAction({
  m,
  tier,
  onDone,
}: {
  m: MeetingView
  tier: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast.success(ok)
      onDone()
    } catch (e) {
      toast.error(extractErrorMessage(e, t("common.somethingWrong")))
    } finally {
      setBusy(false)
    }
  }
  if (m.notice) {
    return (
      <div className="flex items-center gap-1">
        <NoticeBadge m={m} />
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          disabled={busy}
          onClick={() => run(() => teamApi.withdrawAbsence(m.id), t("rules.noticeWithdrawn"))}
        >
          {t("rules.illCome")}
        </Button>
      </div>
    )
  }
  if (m.state) return <StateBadge state={m.state} />
  const ask = () => {
    const hours = tier === "GO!" ? (m.series === "Community" ? 72 : 24) : 0
    const prompt =
      t("rules.cantComePrompt", { title: m.title }) +
      (hours ? "\n" + t("rules.goNoticeHint", { hours }) : "")
    const reason = window.prompt(prompt)
    if (!reason?.trim()) return
    void run(async () => {
      const res = await teamApi.absence(m.id, reason.trim())
      if (res.notice_late) toast.warning(t("rules.lateToast", { hours }))
      else toast.success(t("rules.noticeSent"))
    })
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs text-muted-foreground"
      disabled={busy}
      onClick={ask}
    >
      {t("rules.cantCome")}
    </Button>
  )
}

function RulesCard({
  detail,
  editable,
  onChanged,
}: {
  detail: MemberDetail
  editable: boolean
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const s = detail.summary
  const c = s.community
  const pauses = detail.pauses ?? []
  const canManage = can("members.manage")
  const today = format(new Date(), "yyyy-MM-dd")
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const day = (iso: string) => format(parseISO(iso), "d MMM yyyy", { locale })

  const submit = async () => {
    setBusy(true)
    try {
      if (canManage) {
        await teamApi.setPause(s.id, from, to, note.trim())
        toast.success(t("rules.pauseSet"))
      } else {
        await requestsApi.pause(from, to, note.trim())
        toast.success(t("rules.pauseRequested"))
      }
      setNote("")
      onChanged()
    } catch (e) {
      toast.error(extractErrorMessage(e, t("common.somethingWrong")))
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id: string) => {
    if (!window.confirm(t("rules.removePauseConfirm"))) return
    try {
      await teamApi.deletePause(id)
      onChanged()
    } catch (e) {
      toast.error(extractErrorMessage(e, t("common.somethingWrong")))
    }
  }

  const pauseHint =
    s.tier === "Impact"
      ? t("rules.pauseImpact")
      : s.tier === "GO!"
        ? t("rules.pauseGo")
        : t("rules.pauseCore")

  return (
    <Card className="@3xl:col-span-3" data-tour="rules">
      <CardHeader>
        <CardTitle>{t("rules.title")}</CardTitle>
        <CardDescription>{t("rules.desc", { tier: s.tier })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 @3xl:grid-cols-2">
        {/* Community meetings */}
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2 font-medium">
            {t("rules.community")}
            {c?.breach && (
              <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-xs font-normal text-rose-700 dark:text-rose-300">
                {t("rules.breach")}
              </span>
            )}
          </p>
          <p className="text-muted-foreground">
            {c?.rule === "in_person"
              ? t("rules.goRule")
              : c?.rule === "limit"
                ? t("rules.impactRule", { limit: c.limit })
                : t("rules.noRule", { tier: s.tier })}
          </p>
          {!c ? (
            <p className="text-muted-foreground">{t("rules.noneHeld")}</p>
          ) : (
            <>
              {c.rule === "limit" && c.limit ? (
                <div className="flex items-center gap-3">
                  <ProgressBar value={Math.min(1, c.missed / c.limit)} className="flex-1" />
                  <span className="text-xs whitespace-nowrap tabular-nums">
                    {t("rules.missesUsed", { missed: c.missed, limit: c.limit })}
                  </span>
                </div>
              ) : (
                <p>
                  {t("rules.yearSummary", { held: c.held, missed: c.missed, remote: c.remote })}
                </p>
              )}
              {c.in_a_row && (
                <p className="text-rose-600 dark:text-rose-400">{t("rules.inARow")}</p>
              )}
              {c.late_notices > 0 && (
                <p className="text-rose-600 dark:text-rose-400">
                  {t("rules.lateNotices", { count: c.late_notices })}
                </p>
              )}
              {c.rule === "in_person" && (
                <p className="text-xs text-muted-foreground">{t("rules.goConsequence")}</p>
              )}
            </>
          )}
        </div>

        {/* Pause */}
        <div className="space-y-2 text-sm">
          <p className="font-medium">{t("rules.pause")}</p>
          <p className="text-muted-foreground">
            {t("rules.pauseDesc")} {pauseHint}
          </p>
          {pauses.length > 0 && (
            <div className="divide-y rounded-lg border">
              {pauses.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="whitespace-nowrap tabular-nums">
                    {day(p.start)} – {day(p.end)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.note}</span>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => remove(p.id)}
                    >
                      {t("rules.remove")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {(editable || canManage) && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <Input
                type="date"
                className="w-38"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label={t("rules.from")}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                className="w-38"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                aria-label={t("rules.to")}
              />
              <Input
                className="min-w-40 flex-1"
                placeholder={t("rules.reasonPlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                disabled={busy || !from || !to || (!canManage && !note.trim())}
              >
                {canManage ? t("rules.setPause") : t("rules.requestPause")}
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
