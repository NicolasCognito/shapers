import { pb } from "@/lib/pocketbase"

export type AttendanceState = "present" | "remote" | "excused" | "unexcused"

export type WeekHours = {
  week_start: string
  hours: number
  quota: number
  met: boolean
  paused?: boolean
}

export type PausePeriod = { id: string; start: string; end: string; note: string }

export type CommunityStats = {
  rule: "in_person" | "limit" | ""
  held: number
  missed: number
  remote: number
  limit?: number
  in_a_row: boolean
  late_notices: number
  breach: boolean
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
  paused?: boolean
  pause?: PausePeriod
  community?: CommunityStats
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
  notice?: string
  notice_late?: boolean
  /** The viewer is in this meeting's list (only from /meetings/upcoming). */
  member?: boolean
}

export type MemberDetail = {
  summary: MemberSummary
  pauses?: PausePeriod[]
  past: MeetingView[] | null
  upcoming: MeetingView[] | null
  tasks_done: {
    id: string
    title: string
    project: string
    done_at: string
    cancelled: boolean
    cancel_reason: string
  }[]
}

export type Overview = {
  generated_at: string
  week_start: string
  members: MemberSummary[]
  weeks: {
    week_start: string
    hours: number
    quota: number
    met_count: number
  }[]
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

// English fallback; the UI translates via t(`common.state.${state}`).
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

export type RequestRec = {
  id: string
  type: "hours" | "handoff" | "pause"
  status: "pending" | "approved" | "rejected" | "withdrawn"
  requester: string
  recipient: string
  task: string
  date: string
  end_date?: string
  hours: number
  note: string
  decision_note: string
  created: string
  expand?: {
    requester?: { id: string; name: string }
    recipient?: { id: string; name: string }
    task?: { id: string; title: string }
  }
}

// "Today or yesterday" — members log those themselves, older dates go as a request.
export function selfLogAllowed(day: string) {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  // Local calendar date: toISOString() is UTC and shifts a day near midnight.
  const pad = (n: number) => String(n).padStart(2, "0")
  return day >= `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`
}

export const requestsApi = {
  // Open requests stay few; decided ones grow, so they come in pages.
  pending: () =>
    pb.collection("requests").getFullList<RequestRec>({
      filter: "status = 'pending'",
      expand: "requester,recipient,task",
      sort: "-created",
    }),
  page: (filter: string, page: number, perPage: number) =>
    pb.collection("requests").getList<RequestRec>(page, perPage, {
      filter,
      expand: "requester,recipient,task",
      sort: "-created",
      requestKey: null,
    }),
  hours: (date: string, hours: number, note: string) =>
    pb.send("/api/team/requests/hours", {
      method: "POST",
      body: { date, hours, note },
    }),
  handoff: (task: string, to: string) =>
    pb.send("/api/team/requests/handoff", {
      method: "POST",
      body: { task, to },
    }),
  pause: (start: string, end: string, note: string) =>
    pb.send("/api/team/requests/pause", {
      method: "POST",
      body: { start, end, note },
    }),
  decide: (id: string, approve: boolean, note: string) =>
    pb.send(`/api/team/requests/${id}/decide`, {
      method: "POST",
      body: { approve, note },
    }),
  withdraw: (id: string) =>
    pb.send(`/api/team/requests/${id}/withdraw`, { method: "POST" }),
  restoreTask: (id: string) =>
    pb.send(`/api/team/tasks/${id}/restore`, { method: "POST" }),
  cancelTask: (id: string, reason: string) =>
    pb.send(`/api/team/tasks/${id}/cancel`, {
      method: "POST",
      body: { reason },
    }),
}

export type NewMember = {
  name: string
  email: string
  password: string
  tier: string
  weekly_hours?: number
  is_admin: boolean
  series: string[]
}

export const teamApi = {
  me: () => pb.send<MemberDetail>("/api/team/me", {}),
  member: (id: string) => pb.send<MemberDetail>(`/api/team/members/${id}`, {}),
  overview: () => pb.send<Overview>("/api/team/overview", {}),
  createMember: (body: NewMember) =>
    pb.send<{ id: string; meetings: number }>("/api/team/members", { method: "POST", body }),
  upcoming: () => pb.send<MeetingView[]>("/api/team/meetings/upcoming", {}),
  checkin: (meeting: string, remote: boolean) =>
    pb.send("/api/team/checkin", {
      method: "POST",
      body: { meeting, remote },
    }),
  setPause: (userId: string, start: string, end: string, note: string) =>
    pb.send(`/api/team/members/${userId}/pauses`, {
      method: "POST",
      body: { start, end, note },
    }),
  deletePause: (id: string) =>
    pb.send(`/api/team/pauses/${id}`, { method: "DELETE" }),
  absence: (meeting: string, reason: string) =>
    pb.send<{ notice_late: boolean; state: AttendanceState }>("/api/team/absence", {
      method: "POST",
      body: { meeting, reason },
    }),
  withdrawAbsence: (meeting: string) =>
    pb.send(`/api/team/absence/${meeting}`, { method: "DELETE" }),
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
/** 51.5 → "51 h 30 min", 0.25 → "15 min", 3 → "3 h" (same units in EN and SL). */
export const fmtHours = (h: number) => {
  const total = Math.round(h * 60)
  const hrs = Math.floor(total / 60)
  const min = total % 60
  if (hrs === 0) return `${min} min`
  return min === 0 ? `${hrs} h` : `${hrs} h ${min} min`
}
