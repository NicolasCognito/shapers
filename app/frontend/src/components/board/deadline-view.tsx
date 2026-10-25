import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { addDays, differenceInCalendarDays, endOfWeek, format, parseISO, startOfDay } from "date-fns"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useDateLocale } from "@/i18n"
import { extractErrorMessage } from "@/lib/error"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"

type TaskRec = {
  id: string
  title: string
  project: string
  priority: string
  due_date: string
  assignees: string[]
  expand?: {
    state?: { name: string; category: string }
    project?: { name: string }
    assignees?: { id: string; name: string }[]
  }
}

type Group = "overdue" | "today" | "tomorrow" | "thisWeek" | "nextWeek" | "later" | "noDate"
const GROUPS: Group[] = ["overdue", "today", "tomorrow", "thisWeek", "nextWeek", "later", "noDate"]

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }
const PRIORITY_CLASS: Record<string, string> = {
  urgent: "bg-red-600/10 text-red-700 dark:text-red-300",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "bg-muted text-muted-foreground",
}

function dueDate(t: TaskRec) {
  return t.due_date ? parseISO(t.due_date.replace(" ", "T")) : null
}

function groupOf(due: Date | null, today: Date): Group {
  if (!due) return "noDate"
  const d = differenceInCalendarDays(due, today)
  if (d < 0) return "overdue"
  if (d === 0) return "today"
  if (d === 1) return "tomorrow"
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 })
  if (due <= weekEnd) return "thisWeek"
  if (due <= addDays(weekEnd, 7)) return "nextWeek"
  return "later"
}

/**
 * Board view: tasks across projects (or one project) by deadline, with
 * filters. Open tasks only unless "show done" is on; filtering by status
 * happens on the server so the list stays small as the board grows.
 */
export function DeadlineView({ projectId, onOpenTask }: { projectId?: string | null; onOpenTask?: () => void }) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const navigate = useNavigate()
  const me = pb.authStore.record?.id ?? ""
  const [tasks, setTasks] = useState<TaskRec[] | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [project, setProject] = useState<string>(projectId ?? "all")
  const [who, setWho] = useState<string>("all")
  const [priority, setPriority] = useState<string>("all")
  const [query, setQuery] = useState("")

  useEffect(() => {
    const filter = ["archived != true", "cancelled != true"]
    if (!showDone) filter.push("state.category != 'completed'")
    pb.collection("board_tasks")
      .getFullList<TaskRec>({
        filter: filter.join(" && "),
        fields:
          "id,title,project,priority,due_date,assignees,expand.state.name,expand.state.category,expand.project.name,expand.assignees.id,expand.assignees.name",
        expand: "state,project,assignees",
        requestKey: null,
      })
      .then(setTasks)
      .catch((e) => {
        setTasks([])
        toast.error(extractErrorMessage(e, t("board.loadFailed")))
      })
  }, [showDone, t])

  const projects = useMemo(() => {
    const m = new Map<string, string>()
    for (const x of tasks ?? []) m.set(x.project, x.expand?.project?.name ?? "")
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [tasks])
  const people = useMemo(() => {
    const m = new Map<string, string>()
    for (const x of tasks ?? []) for (const a of x.expand?.assignees ?? []) m.set(a.id, a.name)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [tasks])

  const groups = useMemo(() => {
    const today = startOfDay(new Date())
    const q = query.trim().toLowerCase()
    const out: Record<Group, TaskRec[]> = { overdue: [], today: [], tomorrow: [], thisWeek: [], nextWeek: [], later: [], noDate: [] }
    for (const x of tasks ?? []) {
      if (project !== "all" && x.project !== project) continue
      if (who === "me" && !x.assignees?.includes(me)) continue
      if (who === "none" && x.assignees?.length) continue
      if (who !== "all" && who !== "me" && who !== "none" && !x.assignees?.includes(who)) continue
      if (priority !== "all" && x.priority !== priority) continue
      if (q && !x.title.toLowerCase().includes(q)) continue
      out[groupOf(dueDate(x), today)].push(x)
    }
    for (const g of GROUPS) {
      out[g].sort((a, b) => {
        const da = dueDate(a)?.getTime() ?? 0
        const db = dueDate(b)?.getTime() ?? 0
        return da - db || (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
      })
    }
    return out
  }, [tasks, project, who, priority, query, me])

  const total = GROUPS.reduce((n, g) => n + groups[g].length, 0)
  const select = "h-8 rounded-md border bg-background px-2 text-sm"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("deadlines.search")}
          className="h-8 w-full sm:w-48"
        />
        <select className={select} value={project} onChange={(e) => setProject(e.target.value)} aria-label={t("deadlines.project")}>
          <option value="all">{t("deadlines.allProjects")}</option>
          {projects.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select className={select} value={who} onChange={(e) => setWho(e.target.value)} aria-label={t("deadlines.assignee")}>
          <option value="all">{t("deadlines.everyone")}</option>
          <option value="me">{t("deadlines.me")}</option>
          <option value="none">{t("deadlines.unassigned")}</option>
          {people.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select className={select} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label={t("deadlines.priority")}>
          <option value="all">{t("deadlines.anyPriority")}</option>
          {["urgent", "high", "medium", "low", "none"].map((p) => (
            <option key={p} value={p}>
              {t(`deadlines.prio.${p}`)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          {t("deadlines.showDone")}
        </label>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{t("deadlines.count", { count: total })}</span>
      </div>

      {!tasks ? (
        <Skeleton className="h-64" />
      ) : total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("deadlines.empty")}</p>
      ) : (
        GROUPS.filter((g) => groups[g].length).map((g) => (
          <section key={g} className="space-y-1">
            <h3
              className={cn(
                "text-xs font-semibold tracking-wide uppercase",
                g === "overdue" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
              )}
            >
              {t(`deadlines.group.${g}`)} · {groups[g].length}
            </h3>
            <div className="divide-y rounded-xl border bg-card">
              {groups[g].map((x) => {
                const due = dueDate(x)
                const done = x.expand?.state?.category === "completed"
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => {
                      onOpenTask?.()
                      navigate(workspaceRecordUrl("board", x.id))
                    }}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-muted/40"
                  >
                    <span className={cn("min-w-40 flex-1 text-sm", done && "text-muted-foreground line-through")}>
                      {x.title}
                    </span>
                    <span className="max-w-40 truncate rounded-md bg-muted px-1.5 py-0.5 text-xs">{x.expand?.project?.name}</span>
                    {x.priority !== "none" && PRIORITY_CLASS[x.priority] && (
                      <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", PRIORITY_CLASS[x.priority])}>
                        {t(`deadlines.prio.${x.priority}`)}
                      </span>
                    )}
                    <span className="max-w-36 truncate text-xs text-muted-foreground">
                      {(x.expand?.assignees ?? []).map((a) => a.name.split(" ")[0]).join(", ") || t("deadlines.unassigned")}
                    </span>
                    <span
                      className={cn(
                        "w-20 text-right text-xs tabular-nums",
                        g === "overdue" && !done ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                      )}
                    >
                      {due ? format(due, "EEE d MMM", { locale }) : "—"}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
