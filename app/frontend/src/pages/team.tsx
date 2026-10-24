import { useCallback, useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { Navigate, useSearchParams } from "react-router"
import { useTranslation } from "react-i18next"

import { MemberDetailView } from "@/components/team/member-detail"
import { RollCallSheet } from "@/components/team/roll-call"
import {
  ProgressBar,
  StatTile,
  TierBadge,
  WeekBars,
} from "@/components/team/widgets"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDateLocale } from "@/i18n"
import { can } from "@/lib/permissions"
import { VacationToggle } from "@/components/team/tree-card"
import { MemberSlack, SlackCell, useSlack } from "@/components/team/slack-activity"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"
import {
  SERIES,
  STATE_CLASS,
  fmtHours,
  pct,
  teamApi,
  type AttendanceState,
  type MemberDetail,
  type MemberSummary,
  type Overview,
} from "@/lib/team"

export function TeamPage() {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const [data, setData] = useState<Overview | null>(null)
  // The open member lives in the URL (?member=id) so Jarvis and links can open it.
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get("member")
  const setSelected = useCallback(
    (id: string | null) => setSearchParams(id ? { member: id } : {}, { replace: !id }),
    [setSearchParams]
  )
  const [rollCall, setRollCall] = useState<string | null>(null)

  const load = useCallback(() => {
    teamApi.overview().then(setData)
  }, [])
  useEffect(() => {
    load()
  }, [load])

  if (!can("team.view")) return <Navigate to="/me" replace />

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold">{t("team.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("team.subtitle")}
            {data &&
              t("team.weekOf", {
                date: format(parseISO(data.week_start), "d MMM", { locale }),
              })}
          </p>
        </div>
      </div>

      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">{t("team.overview")}</TabsTrigger>
            <TabsTrigger value="members" data-tour="tab-members">{t("team.members")}</TabsTrigger>
            <TabsTrigger value="attendance" data-tour="tab-attendance">
              {t("team.attendance")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4">
            <OverviewTab
              data={data}
              onSelect={setSelected}
              onRollCall={setRollCall}
            />
          </TabsContent>
          <TabsContent value="members" className="mt-4">
            <MembersTab members={data.members} onSelect={setSelected} />
          </TabsContent>
          <TabsContent value="attendance" className="mt-4">
            <AttendanceTab
              data={data}
              onRollCall={setRollCall}
              onSelect={setSelected}
            />
          </TabsContent>
        </Tabs>
      )}

      <MemberSheet id={selected} onClose={() => setSelected(null)} onChanged={load} />
      <RollCallSheet
        meetingId={rollCall}
        people={data?.members ?? []}
        onClose={() => setRollCall(null)}
        onSaved={load}
      />
    </div>
  )
}

// ---------------- Overview ----------------

function OverviewTab({
  data,
  onSelect,
  onRollCall,
}: {
  data: Overview
  onSelect: (id: string) => void
  onRollCall: (id: string) => void
}) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const m = data.members
  const cur = data.weeks[data.weeks.length - 1]
  const last = data.weeks[data.weeks.length - 2]
  const behind = m.filter((x) => x.behind)
  const avgAttendance =
    m.reduce((a, x) => a + x.attendance.rate, 0) / Math.max(1, m.length)
  const tasksDone = m.reduce((a, x) => a + x.tasks_done, 0)
  const recent = [...data.meetings].reverse().slice(0, 6)

  // Who needs a nudge: behind on hours AND weak attendance, or long silence.
  const attention = m
    .map((x) => ({
      x,
      score:
        (x.behind ? 1 - x.progress : 0) +
        (1 - x.attendance.rate) +
        (x.weeks.slice(-3).every((w) => !w.met) ? 0.5 : 0),
    }))
    .filter((a) => a.score > 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-3 lg:col-span-3 lg:grid-cols-4" data-tour="team-tiles">
        <StatTile
          label={t("team.hoursThisWeek")}
          value={fmtHours(Math.round(cur.hours))}
          hint={t("team.hoursHint", {
            quota: fmtHours(cur.quota),
            last: fmtHours(Math.round(last?.hours ?? 0)),
          })}
        />
        <StatTile
          label={t("team.behindPace")}
          value={`${behind.length} / ${m.length}`}
          tone={behind.length > m.length / 2 ? "warn" : undefined}
          hint={t("team.behindPaceHint")}
        />
        <StatTile
          label={t("team.showedUp")}
          value={pct(avgAttendance)}
          tone={
            avgAttendance >= 0.85
              ? "good"
              : avgAttendance < 0.7
                ? "bad"
                : undefined
          }
          hint={t("team.showedUpHint")}
        />
        <StatTile
          label={t("team.tasksDone")}
          value={tasksDone}
          hint={t("team.tasksDoneHint")}
        />
      </div>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{t("team.orgHours")}</CardTitle>
          <CardDescription>
            {t("team.orgHoursDesc", {
              series: data.weeks.map((w) => w.met_count).join(" → "),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WeekBars weeks={data.weeks} height={160} />
        </CardContent>
      </Card>

      <Card data-tour="team-attention">
        <CardHeader>
          <CardTitle>{t("team.needsAttention")}</CardTitle>
          <CardDescription>
            {t("team.needsAttentionDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {attention.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("team.everyoneFine")}
            </p>
          )}
          {attention.map(({ x }) => (
            <button
              key={x.id}
              onClick={() => onSelect(x.id)}
              className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-muted"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {x.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("team.memberLine", {
                    hours: fmtHours(x.this_week),
                    goal: fmtHours(x.weekly_hours),
                    rate: pct(x.attendance.rate),
                  })}
                </span>
              </span>
              <TierBadge tier={x.tier} />
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("team.byTier")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.tiers.map((ti) => (
            <div key={ti.tier} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <TierBadge tier={ti.tier} />
                <span className="text-muted-foreground">
                  {t("team.membersCount", { count: ti.members })}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("team.behindCount", { count: ti.behind_count })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 text-muted-foreground">
                  {t("team.hours")}
                </span>
                <ProgressBar value={ti.avg_progress} className="flex-1" />
                <span className="w-10 text-right">{pct(ti.avg_progress)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 text-muted-foreground">
                  {t("team.attendShort")}
                </span>
                <ProgressBar value={ti.avg_attendance} className="flex-1" />
                <span className="w-10 text-right">{pct(ti.avg_attendance)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("team.bySeries")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {SERIES.filter((s) => data.series[s]).map((s) => (
            <div key={s} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 truncate">{s}</span>
              <ProgressBar value={data.series[s].rate} className="flex-1" />
              <span className="w-10 text-right tabular-nums">
                {pct(data.series[s].rate)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("team.recentMeetings")}</CardTitle>
          <CardDescription>{t("team.tapToRecord")}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {recent.map((mt) => (
            <button
              key={mt.id}
              onClick={() => onRollCall(mt.id)}
              className="flex w-full items-center gap-2 py-2 text-left hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{mt.title}</span>
                <span className="text-xs text-muted-foreground">
                  {format(parseISO(mt.start), "EEE d MMM", { locale })}
                </span>
              </span>
              <span className="text-sm tabular-nums">
                {mt.stats.present + mt.stats.remote}/{mt.members}
              </span>
              {mt.stats.unmarked > 0 && (
                <span className="rounded bg-amber-500/15 px-1.5 text-xs text-amber-700 dark:text-amber-300">
                  {t("team.unmarked", { count: mt.stats.unmarked })}
                </span>
              )}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------- Members ----------------

type SortKey = "name" | "progress" | "attendance" | "streak" | "tasks"

function MembersTab({
  members,
  onSelect,
}: {
  members: MemberSummary[]
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const slackEnabled = useSlack((s) => s.enabled)
  const loadSlack = useSlack((s) => s.load)
  useEffect(() => {
    void loadSlack().catch(() => {})
  }, [loadSlack])
  const [sort, setSort] = useState<SortKey>("progress")
  const [tier, setTier] = useState<string>("all")
  const rows = useMemo(() => {
    const list = members.filter((m) => tier === "all" || m.tier === tier)
    const key: Record<SortKey, (m: MemberSummary) => number | string> = {
      name: (m) => m.name,
      progress: (m) => m.progress,
      attendance: (m) => m.attendance.rate,
      streak: (m) => -m.streak,
      tasks: (m) => -m.tasks_done,
    }
    return [...list].sort((a, b) => {
      const ka = key[sort](a)
      const kb = key[sort](b)
      return ka < kb ? -1 : ka > kb ? 1 : 0
    })
  }, [members, sort, tier])

  const H = ({
    k,
    children,
    className,
  }: {
    k: SortKey
    children: string
    className?: string
  }) => (
    <th className={cn("px-3 py-2 font-medium", className)}>
      <button
        onClick={() => setSort(k)}
        className={cn(
          "-mx-1 -my-1.5 rounded px-1 py-1.5 hover:text-foreground",
          sort === k && "text-foreground underline"
        )}
      >
        {children}
      </button>
    </th>
  )

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {["all", "Core", "Impact", "GO!"].map((tn) => (
            <Button
              key={tn}
              size="sm"
              variant={tier === tn ? "default" : "outline"}
              onClick={() => setTier(tn)}
            >
              {tn === "all" ? t("team.allTiers") : tn}
            </Button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <H k="name">{t("team.member")}</H>
                <H k="progress" className="min-w-48">
                  {t("team.thisWeek")}
                </H>
                <th className="px-3 py-2 font-medium">{t("team.last6")}</th>
                <H k="streak">{t("team.streak")}</H>
                <H k="attendance">{t("team.showedUp")}</H>
                <H k="tasks">{t("team.tasks")}</H>
                {slackEnabled && <th className="px-3 py-2 font-medium">Slack</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((m) => (
                <tr
                  key={m.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelect(m.id)}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.name}</span>
                      <TierBadge tier={m.tier} />
                      {m.paused && (
                        <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">
                          ⏸ {t("rules.onPauseShort")}
                        </span>
                      )}
                      {m.role !== "member" && (
                        <span className="text-[10px] text-muted-foreground">
                          {m.role}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        value={m.progress}
                        marker={
                          m.weekly_hours
                            ? m.expected / m.weekly_hours
                            : undefined
                        }
                        className="flex-1"
                      />
                      <span className="w-32 text-right text-xs whitespace-nowrap tabular-nums">
                        {fmtHours(m.this_week)} / {m.weekly_hours} h
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex h-6 items-end gap-0.5">
                      {m.weeks.map((w) => (
                        <div
                          key={w.week_start}
                          title={`${w.week_start}: ${fmtHours(w.hours)}`}
                          className={cn(
                            "w-2 rounded-sm",
                            w.met ? "bg-emerald-500" : w.paused ? "bg-sky-400/40" : "bg-primary/40"
                          )}
                          style={{
                            height: `${Math.min(100, (w.hours / Math.max(1, w.quota)) * 100)}%`,
                            minHeight: 2,
                          }}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {m.streak > 0 ? `🔥 ${m.streak}` : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      m.attendance.rate < 0.7 &&
                        "text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {pct(m.attendance.rate)}
                    {m.community?.breach && (
                      <span
                        className="ml-1.5 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-700 dark:text-rose-300"
                        title={t("rules.communityBreachTitle", { missed: m.community.missed })}
                      >
                        {t("rules.communityShort")} ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{m.tasks_done}</td>
                  {slackEnabled && (
                    <td className="px-3 py-2 text-xs">
                      <SlackCell memberId={m.id} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------- Attendance matrix ----------------

function AttendanceTab({
  data,
  onRollCall,
  onSelect,
}: {
  data: Overview
  onRollCall: (id: string) => void
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const [series, setSeries] = useState<string>("Community")
  const [att, setAtt] = useState<Record<string, AttendanceState>>({})
  const [meetingMembers, setMeetingMembers] = useState<
    Record<string, string[]>
  >({})

  useEffect(() => {
    pb.collection("attendance")
      .getFullList<{ meeting: string; user: string; state: AttendanceState }>({
        fields: "meeting,user,state",
      })
      .then((rows) => {
        const map: Record<string, AttendanceState> = {}
        for (const r of rows) map[r.meeting + "|" + r.user] = r.state
        setAtt(map)
      })
    teamApi.pastMeetings().then((ms) => {
      const map: Record<string, string[]> = {}
      for (const m of ms) map[m.id] = m.members
      setMeetingMembers(map)
    })
  }, [data])

  const meetings = data.meetings.filter((m) => m.series === series)
  const memberIds = new Set(meetings.flatMap((m) => meetingMembers[m.id] ?? []))
  const people = data.members.filter((m) => memberIds.has(m.id))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("team.attendanceBySeries")}</CardTitle>
        <CardDescription>
          {t("team.attendanceDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-2">
          {SERIES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={series === s ? "default" : "outline"}
              onClick={() => setSeries(s)}
            >
              {s}{" "}
              {data.series[s] && (
                <span className="ml-1 opacity-70">
                  {pct(data.series[s].rate)}
                </span>
              )}
            </Button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card px-2 py-1 text-left font-medium">
                  {t("team.member")}
                </th>
                {meetings.map((m) => (
                  <th key={m.id} className="px-1 py-1">
                    <button
                      onClick={() => onRollCall(m.id)}
                      className="rounded px-1 font-medium hover:bg-muted"
                      title={t("team.recordAttendance")}
                    >
                      {format(parseISO(m.start), "d.M", { locale })}
                    </button>
                  </th>
                ))}
                <th className="px-2 py-1 text-right font-medium">{t("team.rate")}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                let held = 0
                let came = 0
                return (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="sticky left-0 bg-card px-2 py-1">
                      <button
                        className="hover:underline"
                        onClick={() => onSelect(p.id)}
                      >
                        {p.name}
                      </button>
                    </td>
                    {meetings.map((m) => {
                      const isMember = meetingMembers[m.id]?.includes(p.id)
                      if (!isMember) return <td key={m.id} />
                      const st = att[m.id + "|" + p.id]
                      held++
                      if (st === "present" || st === "remote") came++
                      return (
                        <td key={m.id} className="px-1 py-1 text-center">
                          <span
                            title={t(`common.state.${st ?? "none"}`)}
                            className={cn(
                              "inline-block size-5 rounded leading-5",
                              STATE_CLASS[st ?? ""]
                            )}
                          >
                            {st ? t(`common.stateShort.${st}`) : "·"}
                          </span>
                        </td>
                      )
                    })}
                    <td className="px-2 py-1 text-right tabular-nums">
                      {held ? pct(came / held) : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(
            ["present", "remote", "excused", "unexcused"] as AttendanceState[]
          ).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className={cn("inline-block size-3 rounded", STATE_CLASS[s])}
              />{" "}
              {t(`common.state.${s}`)}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------- Member drill-down ----------------

function MemberSheet({
  id,
  onClose,
  onChanged,
}: {
  id: string | null
  onClose: () => void
  /** Refresh the overview too (pause badges, totals). */
  onChanged?: () => void
}) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<MemberDetail | null>(null)
  useEffect(() => {
    if (!id) return
    setDetail(null)
    teamApi.member(id).then(setDetail)
  }, [id])
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>{detail?.summary.name ?? t("team.member")}</SheetTitle>
          {id && can("members.manage") && <VacationToggle userId={id} />}
          {id && <MemberSlack memberId={id} />}
        </SheetHeader>
        <div className="p-4">
          {detail ? (
            <MemberDetailView
              detail={detail}
              editable={false}
              canModerate={can("tasks.moderate")}
              onChanged={() => {
                if (id) void teamApi.member(id).then(setDetail)
                onChanged?.()
              }}
            />
          ) : (
            <Skeleton className="h-96" />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
