import { useEffect, useState } from "react"

import { useTranslation } from "react-i18next"
import { ClientResponseError, type RecordModel } from "pocketbase"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { pb } from "@/lib/pocketbase"
import i18n from "@/i18n"

// Module-level helpers translate at call time, so they follow the language.
const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, options)

type Change = {
  from?: unknown
  to?: unknown
  changed?: boolean
}

type OperationLogRecord = RecordModel & {
  task_id: string
  task_title: string
  actor: string
  actor_name: string
  action: "create" | "update" | "move" | "delete" | "archive" | "restore"
  changes: Record<string, Change>
  created: string
  expand?: {
    actor?: RecordModel & {
      name: string
      email: string
      avatar: string
    }
  }
}

type OperationLog = {
  id: string
  actorName: string
  actorAvatar?: string
  action: OperationLogRecord["action"]
  changes: Record<string, Change>
  created: string
}

function toOperationLog(record: OperationLogRecord): OperationLog {
  const actor = record.expand?.actor
  return {
    id: record.id,
    actorName: actor?.name || actor?.email || record.actor_name || t("activity.system"),
    actorAvatar: actor?.avatar
      ? pb.files.getURL(actor, actor.avatar)
      : undefined,
    action: record.action,
    changes: record.changes || {},
    created: record.created,
  }
}

function upsertLog(logs: OperationLog[], log: OperationLog) {
  const next = logs.filter((item) => item.id !== log.id)
  return [log, ...next].sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
  )
}

function text(value: unknown) {
  const none = t("activity.none")
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : none
  if (typeof value === "string") return value || none
  return String(value ?? none)
}

function describeLog(log: OperationLog) {
  if (log.action === "create") return [t("activity.task.created")]
  if (log.action === "delete") return [t("activity.task.deleted")]
  if (log.action === "archive") return [t("activity.task.archived")]
  if (log.action === "restore") return [t("activity.task.restored")]

  const descriptions: string[] = []
  const changes = log.changes
  const fromTo = (c: Change) => ({ from: text(c.from), to: text(c.to) })
  if (changes.state) {
    descriptions.push(t("activity.task.moved", fromTo(changes.state)))
  }
  if (changes.title) {
    descriptions.push(t("activity.task.renamed", fromTo(changes.title)))
  }
  if (changes.description) descriptions.push(t("activity.task.descUpdated"))
  if (changes.priority) {
    descriptions.push(t("activity.task.priority", fromTo(changes.priority)))
  }
  if (changes.due_date) {
    descriptions.push(t("activity.task.dueDate", fromTo(changes.due_date)))
  }
  if (changes.labels) {
    descriptions.push(t("activity.task.labels", fromTo(changes.labels)))
  }
  if (changes.assignees) {
    descriptions.push(t("activity.task.assignees", fromTo(changes.assignees)))
  }
  if (changes.documents) {
    descriptions.push(t("activity.task.documents", fromTo(changes.documents)))
  }
  return descriptions.length > 0 ? descriptions : [t("activity.task.updated")]
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(i18n.language, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function TaskActivity({ taskId }: { taskId: string }) {
  useTranslation()
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    const filter = pb.filter("task_id = {:taskId}", { taskId })

    const connect = async () => {
      try {
        const records = await pb
          .collection("board_task_operation_logs")
          .getFullList<OperationLogRecord>({
            filter,
            sort: "-created",
            expand: "actor",
            requestKey: null,
          })
        if (active) setLogs(records.map(toOperationLog))

        unsubscribe = await pb
          .collection("board_task_operation_logs")
          .subscribe<OperationLogRecord>(
            "*",
            (event) => {
              if (!active) return
              if (event.action === "delete") {
                setLogs((current) =>
                  current.filter((log) => log.id !== event.record.id)
                )
              } else {
                setLogs((current) =>
                  upsertLog(current, toOperationLog(event.record))
                )
              }
            },
            { filter, expand: "actor", requestKey: null }
          )
      } catch (err) {
        // 组件卸载或被新请求替代时，静默忽略 PocketBase 自动取消产生的 abort 错误
        if (err instanceof ClientResponseError && err.isAbort) return
        throw err
      } finally {
        if (active) setLoading(false)
      }
    }

    void connect()
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [taskId])

  return (
    <div className="flex flex-col gap-3 border-t pt-5">
      <div>
        <p className="text-sm font-medium">{t("activity.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("activity.taskDesc")}
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">{t("activity.loading")}</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("activity.empty")}
        </p>
      ) : (
        <div className="relative flex flex-col gap-4 before:absolute before:top-3 before:bottom-3 before:left-3 before:w-px before:bg-border">
          {logs.map((log) => (
            <div key={log.id} className="relative flex gap-3">
              <Avatar size="sm" className="z-10 ring-2 ring-popover">
                {log.actorAvatar && (
                  <AvatarImage
                    src={log.actorAvatar}
                    alt={log.actorName}
                    className="object-cover"
                  />
                )}
                <AvatarFallback className="text-[9px]">
                  {log.actorName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium">{log.actorName}</span>
                  <time className="shrink-0 text-[10px] text-muted-foreground">
                    {formatTime(log.created)}
                  </time>
                </div>
                {describeLog(log).map((description) => (
                  <p
                    key={description}
                    className="mt-0.5 text-xs text-muted-foreground"
                  >
                    {description}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
