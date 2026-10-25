import { useCallback, useEffect, useMemo, useState } from "react"
import { notify } from "@/lib/notify"
import { useTranslation } from "react-i18next"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  GridViewIcon,
  Menu01Icon,
  Search01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { extractErrorMessage } from "@/lib/error"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"

type PrefRec = {
  id: string
  project: string
  pinned: boolean
  expand?: { project?: { id: string; name: string; description: string } }
}
type TaskRec = {
  project: string
  assignees: string[]
  cancelled: boolean
  priority: string
  due_date: string
  expand?: { state?: { category: string } }
}
type Item = {
  prefId: string
  id: string
  name: string
  description: string
  pinned: boolean
  open: number
  mine: number
  /** Open tasks due tomorrow or earlier (overdue included). */
  hot: number
  /** Open tasks with priority "urgent". */
  urgent: number
}

const VIEW_KEY = "shapers.board.view"

function readView(): "grid" | "list" {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"
  } catch {
    return "grid"
  }
}

export function ProjectGrid({
  onOpen,
  reloadKey,
}: {
  onOpen: (id: string) => void
  reloadKey: unknown
}) {
  const { t } = useTranslation()
  const me = pb.authStore.record?.id ?? ""
  const [items, setItems] = useState<Item[] | null>(null)
  const [view, setView] = useState(readView)
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    const [prefs, tasks] = await Promise.all([
      pb.collection("board_project_preferences").getFullList<PrefRec>({
        filter: pb.filter("user = {:me} && project.archived = false", { me }),
        expand: "project",
        requestKey: null,
      }),
      pb.collection("board_tasks").getFullList<TaskRec>({
        filter: "archived != true",
        fields: "project,assignees,cancelled,priority,due_date,expand.state.category",
        expand: "state",
        requestKey: null,
      }),
    ])
    const open: Record<string, number> = {}
    const mine: Record<string, number> = {}
    const hot: Record<string, number> = {}
    const urgent: Record<string, number> = {}
    // "Hot" = due by the end of tomorrow, overdue included.
    const hotUntil = new Date()
    hotUntil.setHours(0, 0, 0, 0)
    hotUntil.setDate(hotUntil.getDate() + 2)
    const bump = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1)
    for (const t of tasks) {
      if (t.cancelled || t.expand?.state?.category === "completed") continue
      bump(open, t.project)
      if (t.assignees?.includes(me)) bump(mine, t.project)
      if (t.due_date && new Date(t.due_date.replace(" ", "T")) < hotUntil) bump(hot, t.project)
      if (t.priority === "urgent") bump(urgent, t.project)
    }
    setItems(
      prefs.flatMap((p) =>
        p.expand?.project
          ? [
              {
                prefId: p.id,
                id: p.project,
                name: p.expand.project.name,
                description: p.expand.project.description,
                pinned: p.pinned,
                open: open[p.project] ?? 0,
                mine: mine[p.project] ?? 0,
                hot: hot[p.project] ?? 0,
                urgent: urgent[p.project] ?? 0,
              },
            ]
          : []
      )
    )
  }, [me])

  useEffect(() => {
    load().catch((e) =>
      notify.error(extractErrorMessage(e, t("board.loadFailed")))
    )
  }, [load, reloadKey])

  const togglePin = async (item: Item) => {
    setItems(
      (list) =>
        list?.map((x) =>
          x.id === item.id ? { ...x, pinned: !x.pinned } : x
        ) ?? null
    )
    try {
      await pb
        .collection("board_project_preferences")
        .update(item.prefId, { pinned: !item.pinned })
    } catch (e) {
      notify.error(extractErrorMessage(e, t("common.couldNotSave")))
      load()
    }
  }

  const switchView = (v: "grid" | "list") => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* per-browser convenience only */
    }
  }

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items ?? [])
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          Number(b.mine > 0) - Number(a.mine > 0) ||
          a.name.localeCompare(b.name)
      )
  }, [items, query])

  if (!items) return <Skeleton className="h-48" />

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-8"
            placeholder={t("board.search", { count: items.length })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="ml-auto flex rounded-md border p-0.5">
          {(["grid", "list"] as const).map((v) => (
            <Button
              key={v}
              variant={view === v ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => switchView(v)}
              aria-label={
                v === "grid" ? t("board.gridView") : t("board.listView")
              }
            >
              <HugeiconsIcon
                icon={v === "grid" ? GridViewIcon : Menu01Icon}
                strokeWidth={2}
              />
            </Button>
          ))}
        </div>
      </div>

      {sorted.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("board.noMatch")}
        </p>
      )}

      <div
        className={cn(
          view === "grid"
            ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            : "divide-y rounded-xl border"
        )}
      >
        {sorted.map((item) => {
          const star = (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                togglePin(item)
              }}
              className={cn(
                "shrink-0 rounded p-1 transition-colors hover:bg-muted",
                item.pinned
                  ? "text-amber-500"
                  : "text-muted-foreground/50 hover:text-muted-foreground"
              )}
              aria-label={item.pinned ? t("board.unstar") : t("board.star")}
              aria-pressed={item.pinned}
            >
              <HugeiconsIcon
                icon={StarIcon}
                strokeWidth={2}
                className={cn("size-4", item.pinned && "fill-current")}
              />
            </button>
          )
          const counts = (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {item.mine > 0 && (
                <span className="mr-2 rounded-md bg-sky-500/15 px-1.5 py-0.5 font-medium text-sky-700 dark:text-sky-300">
                  {t("board.yours", { count: item.mine })}
                </span>
              )}
              <span
                className={cn(
                  item.open > 0 &&
                    "rounded-md bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-300"
                )}
              >
                {t("board.open", { count: item.open })}
              </span>
              {item.hot > 0 && (
                <span
                  className="ml-2 rounded-md bg-rose-500/10 px-1.5 py-0.5 font-medium text-rose-700 ring-1 ring-rose-500/25 dark:text-rose-300"
                  title={t("board.hotHint")}
                >
                  🔥 {t("board.hot", { count: item.hot })}
                </span>
              )}
              {item.urgent > 0 && (
                <span
                  className="ml-2 rounded-md bg-red-600/10 px-1.5 py-0.5 font-medium text-red-700 ring-1 ring-red-600/30 dark:text-red-300"
                  title={t("board.urgentHint")}
                >
                  ⚡ {t("board.urgent", { count: item.urgent })}
                </span>
              )}
            </span>
          )
          return view === "grid" ? (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(item.id)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(item.id)}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40",
                item.open > 0 && "border-amber-500/30",
                item.mine > 0 && "border-l-4 border-l-sky-500"
              )}
            >
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 font-medium">{item.name}</p>
                {star}
              </div>
              {item.description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {item.description}
                </p>
              )}
              <div className="mt-auto">{counts}</div>
            </div>
          ) : (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(item.id)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(item.id)}
              className={cn(
                "flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/40",
                item.mine > 0 && "border-l-4 border-l-sky-500"
              )}
            >
              {star}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {item.name}
              </span>
              {counts}
            </div>
          )
        })}
      </div>
    </div>
  )
}
