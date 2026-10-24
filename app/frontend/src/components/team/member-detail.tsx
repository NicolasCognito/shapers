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
import { cn } from "@/lib/utils"
import {
  fmtHours,
  pct,
  requestsApi,
  selfLogAllowed,
  teamApi,
  type HourLog,
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
        <Card className="@3xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("memberDetail.thisWeek")} <TierBadge tier={s.tier} />
            </CardTitle>
            <CardDescription>
              {t("memberDetail.commitment", {
                tier: s.tier,
                hours: fmtHours(s.weekly_hours),
              })}
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
                    : s.behind
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground")
                }
              >
                {s.progress >= 1
                  ? t("memberDetail.goalReached")
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
        <Card>
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
              <MeetingRow key={m.id} m={m} action={<span />} />
            ))}
          </CardContent>
        </Card>

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
        <Input
          type="date"
          className="w-40"
          value={date}
          max={format(new Date(), "yyyy-MM-dd")}
          onChange={(e) => setDate(e.target.value)}
        />
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
            {editable && l.source !== "import" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={async () => {
                  await teamApi.deleteLog(l.id)
                  setTick((t) => t + 1)
                  onChanged()
                }}
              >
                {t("memberDetail.undo")}
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
