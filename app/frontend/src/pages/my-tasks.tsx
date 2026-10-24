import { useCallback, useEffect, useMemo, useState } from "react"
import { differenceInCalendarDays, format, parseISO } from "date-fns"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { useDateLocale } from "@/i18n"
import { extractErrorMessage } from "@/lib/error"
import { pb } from "@/lib/pocketbase"
import { requestsApi } from "@/lib/team"
import { cn } from "@/lib/utils"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import { PRIORITY_META, type Priority } from "@/store/board"

type StateRec = {
  id: string
  project: string
  name: string
  category: "pending" | "active" | "completed"
  sort_order: number
}
type TaskRec = {
  id: string
  title: string
  project: string
  state: string
  priority: Priority
  due_date: string
  assignees: string[]
  owner: string
  handoff_to: string
  cancelled: boolean
  cancel_reason: string
  updated: string
  expand?: { project?: { id: string; name: string }; state?: StateRec }
}
type UserRec = { id: string; name: string }

const selectClass =
  "h-7 rounded-md border bg-background px-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"

export function MyTasksPage() {
  const { t: tr } = useTranslation()
  const dateLocale = useDateLocale()
  const me = pb.authStore.record?.id ?? ""
  const [tasks, setTasks] = useState<TaskRec[] | null>(null)
  const [states, setStates] = useState<StateRec[]>([])
  const [users, setUsers] = useState<UserRec[]>([])
  const [showDone, setShowDone] = useState(false)

  const load = useCallback(async () => {
    const list = await pb.collection("board_tasks").getFullList<TaskRec>({
      filter: pb.filter("assignees ~ {:me} && archived != true", { me }),
      expand: "project,state",
      sort: "due_date",
    })
    const projectIds = [...new Set(list.map((t) => t.project))]
    const st = projectIds.length
      ? await pb.collection("board_project_states").getFullList<StateRec>({
          filter: projectIds.map((p) => `project = "${p}"`).join(" || "),
          sort: "sort_order",
        })
      : []
    setStates(st)
    setTasks(list)
  }, [me])

  useEffect(() => {
    load().catch((e) =>
      toast.error(extractErrorMessage(e, tr("myTasks.loadFailed")))
    )
    pb.collection("users")
      .getFullList<UserRec>({
        filter: "tier != ''",
        sort: "name",
        fields: "id,name",
      })
      .then(setUsers)
  }, [load])

  const update = async (t: TaskRec, patch: Partial<TaskRec>, msg?: string) => {
    // Optimistic: the list feels instant, the server keeps the history.
    setTasks(
      (ts) => ts?.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) ?? null
    )
    try {
      await pb.collection("board_tasks").update(t.id, patch)
      if (msg) toast.success(msg)
      if (patch.state || patch.assignees) load()
    } catch (e) {
      toast.error(extractErrorMessage(e, tr("myTasks.updateFailed")))
      load()
    }
  }

  const stateOf = (t: TaskRec) =>
    states.find((s) => s.id === t.state) ?? t.expand?.state
  const firstOf = (project: string, cat: StateRec["category"]) =>
    states.find((s) => s.project === project && s.category === cat)

  const groups = useMemo(() => {
    const open = (tasks ?? []).filter(
      (t) => stateOf(t)?.category !== "completed"
    )
    const today = new Date()
    const g: Record<string, TaskRec[]> = {
      overdue: [],
      thisWeek: [],
      later: [],
      noDate: [],
    }
    for (const t of open) {
      if (!t.due_date) g.noDate.push(t)
      else {
        const d = differenceInCalendarDays(parseISO(t.due_date), today)
        if (d < 0) g.overdue.push(t)
        else if (d <= 7) g.thisWeek.push(t)
        else g.later.push(t)
      }
    }
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, states])
  const done = (tasks ?? []).filter((t) => stateOf(t)?.category === "completed")
  const openCount = Object.values(groups).reduce((a, g) => a + g.length, 0)

  const Row = ({ t }: { t: TaskRec }) => {
    const st = stateOf(t)
    const isDone = st?.category === "completed"
    const cancelled = t.cancelled
    const handingTo = users.find((u) => u.id === t.handoff_to)
    const projectStates = states.filter((s) => s.project === t.project)
    const overdue =
      !isDone &&
      t.due_date &&
      differenceInCalendarDays(parseISO(t.due_date), new Date()) < 0
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
        <Checkbox
          disabled={cancelled}
          checked={isDone}
          onCheckedChange={(v) => {
            const target = firstOf(t.project, v ? "completed" : "pending")
            if (target)
              update(t, { state: target.id }, v ? tr("myTasks.doneToast") : undefined)
          }}
          aria-label={tr("myTasks.doneAria")}
        />
        <div className="min-w-0 flex-1">
          <Link
            to={workspaceRecordUrl("board", t.id)}
            className={cn(
              "block truncate text-sm font-medium hover:underline",
              isDone && "text-muted-foreground",
              cancelled && "line-through"
            )}
          >
            {t.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {t.expand?.project?.name}
          </p>
          {cancelled && (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {t.cancel_reason
                ? tr("myTasks.cancelledByAdminReason", {
                    reason: t.cancel_reason,
                  })
                : tr("myTasks.cancelledByAdmin")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            className={selectClass}
            disabled={cancelled}
            value={t.state}
            onChange={(e) => update(t, { state: e.target.value })}
            aria-label={tr("myTasks.status")}
          >
            {projectStates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={t.priority}
            onChange={(e) =>
              update(t, { priority: e.target.value as Priority })
            }
            aria-label={tr("myTasks.priority")}
            style={{
              color: PRIORITY_META.find((p) => p.value === t.priority)?.color,
            }}
          >
            {PRIORITY_META.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={cn(
              selectClass,
              overdue && "border-rose-400 text-rose-600"
            )}
            value={t.due_date ? t.due_date.slice(0, 10) : ""}
            onChange={(e) =>
              update(t, {
                due_date: e.target.value
                  ? e.target.value + " 12:00:00.000Z"
                  : "",
              })
            }
            aria-label={tr("myTasks.dueDate")}
          />
          {handingTo ? (
            <Link
              to="/requests"
              className="text-xs text-amber-600 hover:underline dark:text-amber-400"
            >
              {tr("myTasks.waitingFor", { name: handingTo.name })}
            </Link>
          ) : (
            !isDone &&
            !cancelled &&
            t.owner === me && (
              <select
                className={selectClass}
                value=""
                onChange={async (e) => {
                  const to = users.find((u) => u.id === e.target.value)
                  if (!to) return
                  try {
                    await requestsApi.handoff(t.id, to.id)
                    toast.success(tr("myTasks.handedTo", { name: to.name }))
                    load()
                  } catch (err) {
                    toast.error(
                      extractErrorMessage(err, tr("myTasks.handoverFailed"))
                    )
                  }
                }}
                aria-label={tr("myTasks.handToAria")}
              >
                <option value="">{tr("myTasks.handTo")}</option>
                {users
                  .filter((u) => u.id !== me)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            )
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex items-end gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold">{tr("myTasks.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {tr("myTasks.subtitle")}
            {tasks &&
              ` · ${tr("myTasks.counts", { open: openCount, done: done.length })}`}
          </p>
        </div>
        <Link
          to="/board"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          {tr("myTasks.openBoard")}
        </Link>
      </div>

      {!tasks ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          {openCount === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {tr("myTasks.nothingOpen")}
              </CardContent>
            </Card>
          )}
          {Object.entries(groups).map(([name, list]) =>
            list.length ? (
              <Card key={name}>
                <CardContent className="pt-4">
                  <p
                    className={cn(
                      "mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                      name === "overdue" && "text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {tr(`myTasks.group.${name}`)} · {list.length}
                  </p>
                  <div className="divide-y">
                    {list.map((t) => (
                      <Row key={t.id} t={t} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null
          )}
          {done.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <button
                  className="text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
                  onClick={() => setShowDone((v) => !v)}
                >
                  {showDone ? "▾" : "▸"} {tr("myTasks.done")} · {done.length}
                </button>
                {showDone && (
                  <div className="divide-y">
                    {done.map((t) => (
                      <div key={t.id} className="flex items-center gap-2">
                        <div className="flex-1">
                          <Row t={t} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(t.updated), "d MMM", { locale: dateLocale })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
