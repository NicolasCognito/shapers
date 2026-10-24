import { pb } from "@/lib/pocketbase"

export type AttendanceState = "present" | "remote" | "excused" | "unexcused"

export type WeekHours = {
  week_start: string
  hours: number
  quota: number
  met: boolean
}

export type AttendanceStats = {
  present: number
  remote: number
  excused: number
  unexcused: number
  unmarked: number
  rate: number
}

export type MemberSummary = {
  id: string
  name: string
  email: string
  tier: "Core" | "Impact" | "GO!" | ""
  weekly_hours: number
  is_admin: boolean
  role: string
  series: string[]
  weeks: WeekHours[]
  this_week: number
  progress: number
  expected: number
  behind: boolean
  streak: number
  attendance: AttendanceStats
  by_series: Record<string, AttendanceStats>
  tasks_done: number
  last_task_done: string
}

export type MeetingView = {
  id: string
  title: string
  series: string
  start: string
  end: string
  location: string
  state: AttendanceState | ""
  can_check_in: boolean
}

export type MemberDetail = {
  summary: MemberSummary
  past: MeetingView[] | null
  upcoming: MeetingView[] | null
}

export type Overview = {
  generated_at: string
  week_start: string
  members: MemberSummary[]
  weeks: { week_start: string; hours: number; quota: number; met_count: number }[]
  meetings: {
    id: string
    title: string
    series: string
    start: string
    members: number
    stats: AttendanceStats
  }[]
  series: Record<string, AttendanceStats>
  tiers: {
    tier: string
    members: number
    avg_progress: number
    avg_attendance: number
    behind_count: number
  }[]
}

export type HourLog = {
  id: string
  user: string
  date: string
  hours: number
  note: string
  project: string
  source: string
}

export const SERIES = [
  "Community",
  "Summer School",
  "Grants",
  "Shape Talks",
  "Shapers Tech",
  "Shapers Voice",
] as const

export const STATE_LABEL: Record<AttendanceState, string> = {
  present: "Present",
  remote: "Remote",
  excused: "Excused",
  unexcused: "Missed",
}

// Tailwind classes per attendance state (light + dark friendly).
export const STATE_CLASS: Record<AttendanceState | "", string> = {
  present: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  remote: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  excused: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  unexcused: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "": "bg-muted text-muted-foreground",
}


export const teamApi = {
  me: () => pb.send<MemberDetail>("/api/team/me", {}),
  member: (id: string) => pb.send<MemberDetail>(`/api/team/members/${id}`, {}),
  overview: () => pb.send<Overview>("/api/team/overview", {}),
  upcoming: () => pb.send<MeetingView[]>("/api/team/meetings/upcoming", {}),
  checkin: (meeting: string, remote: boolean) =>
    pb.send("/api/team/checkin", {
      method: "POST",
      body: { meeting, remote },
    }),
  bulkAttendance: (
    meeting: string,
    entries: { user: string; state: AttendanceState }[]
  ) =>
    pb.send<{ saved: number }>("/api/team/attendance/bulk", {
      method: "POST",
      body: { meeting, entries },
    }),
  meetingAttendance: (meeting: string) =>
    pb.collection("attendance").getFullList<{
      id: string
      user: string
      state: AttendanceState
    }>({ filter: pb.filter("meeting = {:m}", { m: meeting }) }),
  meeting: (id: string) =>
    pb.collection("meetings").getOne<{
      id: string
      title: string
      series: string
      start_at: string
      members: string[]
    }>(id),
  pastMeetings: () =>
    pb.collection("meetings").getFullList<{
      id: string
      title: string
      series: string
      start_at: string
      members: string[]
    }>({ filter: pb.filter("start_at <= {:now}", { now: new Date() }), sort: "-start_at" }),
  users: () =>
    pb.collection("users").getFullList<{
      id: string
      name: string
      email: string
      tier: string
    }>({ filter: "tier != ''", sort: "name" }),
  myLogs: (userId: string) =>
    pb.collection("hour_logs").getList<HourLog>(1, 20, {
      filter: pb.filter("user = {:u}", { u: userId }),
      sort: "-date,-created",
    }),
  logHours: (userId: string, date: Date, hours: number, note: string) =>
    pb.collection("hour_logs").create<HourLog>({
      user: userId,
      date: date.toISOString(),
      hours,
      note,
      source: "manual",
    }),
  deleteLog: (id: string) => pb.collection("hour_logs").delete(id),
}

export const pct = (v: number) => `${Math.round(v * 100)}%`
export const fmtHours = (h: number) =>
  `${Number.isInteger(h) ? h : h.toFixed(1)} h`
