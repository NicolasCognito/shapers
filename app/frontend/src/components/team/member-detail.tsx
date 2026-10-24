import { useEffect, useState } from "react"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"

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
  const cancelTask = async (id: string, title: string) => {
    const reason = window.prompt(
      `Why should “${title}” not count as done? The member will see this.`
    )
    if (!reason?.trim()) return
    try {
      await requestsApi.cancelTask(id, reason.trim())
      toast.success("Task cancelled")
      onChanged()
    } catch (e) {
      toast.error(extractErrorMessage(e, "Could not cancel"))
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
              This week <TierBadge tier={s.tier} />
            </CardTitle>
            <CardDescription>
              {s.tier} commitment: {fmtHours(s.weekly_hours)} per week
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <span className="text-4xl font-semibold tabular-nums">
                {fmtHours(s.this_week)}
              </span>
              <span className="pb-1 text-muted-foreground">
                of {fmtHours(s.weekly_hours)}
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
                  ? "Goal reached 🎉"
                  : s.behind
                    ? `${fmtHours(Math.max(0, s.expected - s.this_week))} behind pace`
                    : "On track"}
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
            <CardTitle>Streak</CardTitle>
            <CardDescription>
              Weeks in a row at or above your goal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-4xl font-semibold">
              {s.streak > 0 ? "🔥" : "🌱"} {s.streak}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                week{s.streak === 1 ? "" : "s"}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-xs text-muted-foreground">Showed up</p>
                <p className="font-semibold">{pct(s.attendance.rate)}</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-xs text-muted-foreground">Tasks done</p>
                <p className="font-semibold">{s.tasks_done}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {editable && openNow.length > 0 && (
          <Card className="border-primary/40 bg-primary/5 @3xl:col-span-3">
            <CardHeader>
              <CardTitle>Clock in</CardTitle>
              <CardDescription>A meeting is happening now</CardDescription>
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
            <CardTitle>Hours, last 6 weeks</CardTitle>
            <CardDescription>Green weeks reached the goal</CardDescription>
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
            <CardTitle>Next meetings</CardTitle>
            <CardDescription>From the team calendar</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing in the next two weeks.
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
              Finished tasks ·{" "}
              {(detail.tasks_done ?? []).filter((t) => !t.cancelled).length}
            </CardTitle>
            <CardDescription>
              Completed on the board, newest first
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(detail.tasks_done ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No finished tasks yet.
              </p>
            ) : (
              <div className="max-h-64 divide-y overflow-y-auto text-sm">
                {detail.tasks_done.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-1.5">
                    <span className="w-16 shrink-0 text-muted-foreground">
                      {format(parseISO(t.done_at.replace(" ", "T")), "d MMM")}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        t.cancelled && "text-muted-foreground line-through"
                      )}
                      title={
                        t.cancelled
                          ? `Cancelled: ${t.cancel_reason}`
                          : undefined
                      }
                    >
                      {t.title}
                    </span>
                    {t.cancelled ? (
                      <span className="truncate text-xs text-rose-600 dark:text-rose-400">
                        Cancelled{t.cancel_reason && `: ${t.cancel_reason}`}
                      </span>
                    ) : (
                      <span className="truncate text-xs text-muted-foreground">
                        {t.project}
                      </span>
                    )}
                    {canModerate && !t.cancelled && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => cancelTask(t.id, t.title)}
                      >
                        Cancel
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
            <CardTitle>Attendance</CardTitle>
            <CardDescription>
              All meetings of your series so far
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
        toast.success("Request sent to the admins — see Requests")
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
      toast.success(`Logged ${fmtHours(h)}`)
      setHours("")
      setNote("")
      onLogged()
    } catch (e) {
      toast.error(extractErrorMessage(e, "Something went wrong"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
      <p className="text-sm font-medium">Log hours</p>
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
          placeholder="Hours"
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
          placeholder="What did you work on? (optional)"
          className="min-w-40 flex-1"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          disabled={busy || !hours || (asRequest && !note.trim())}
        >
          {asRequest ? "Send request" : "Log"}
        </Button>
        {asRequest && (
          <p className="w-full text-xs text-muted-foreground">
            Older than yesterday: the admins approve it. Say what you worked on.
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
        Recent entries
      </p>
      <div className="max-h-48 divide-y overflow-y-auto text-sm">
        {logs.map((l) => (
          <div key={l.id} className="flex items-center gap-3 py-1.5">
            <span className="w-20 shrink-0 text-muted-foreground">
              {format(parseISO(l.date), "d MMM")}
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
                Undo
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
  const [busy, setBusy] = useState(false)
  if (state === "present" || state === "remote") {
    return <StateBadge state={state} />
  }
  const go = async (remote: boolean) => {
    setBusy(true)
    try {
      await teamApi.checkin(meetingId, remote)
      toast.success(remote ? "Joined remotely ✔" : "You're in ✔")
      onDone()
    } catch (e) {
      toast.error(extractErrorMessage(e, "Something went wrong"))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={busy} onClick={() => go(false)}>
        I'm here
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => go(true)}
      >
        Remote
      </Button>
    </div>
  )
}
