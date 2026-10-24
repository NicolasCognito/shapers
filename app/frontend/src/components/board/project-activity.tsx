import { useEffect, useState } from "react"

import { useTranslation } from "react-i18next"
import { ClientResponseError, type RecordModel } from "pocketbase"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { pb } from "@/lib/pocketbase"
import i18n from "@/i18n"

// Module-level helpers translate at call time, so they follow the language.
const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, options)

type OwnerSnapshot = { id: string; name: string }
type SubjectSnapshot = { id?: string; name?: string; role?: string }
type Change = { from?: unknown; to?: unknown; changed?: boolean }
type ProjectOperationAction =
  | "transfer_owner"
  | "update_project"
  | "create_state"
  | "update_state"
  | "delete_state"
  | "create_label"
  | "update_label"
  | "delete_label"
  | "add_member"
  | "update_member"
  | "remove_member"

type ProjectOperationLogRecord = RecordModel & {
  actor: string
  actor_name: string
  action: ProjectOperationAction
  changes?: Record<string, unknown>
  created: string
  expand?: {
    actor?: RecordModel & {
      name: string
      email: string
      avatar: string
    }
  }
}

type ProjectOperationLog = {
  id: string
  actorName: string
  actorAvatar?: string
  action: ProjectOperationAction
  changes: Record<string, unknown>
  created: string
}

function toProjectOperationLog(
  record: ProjectOperationLogRecord
): ProjectOperationLog {
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

function change(log: ProjectOperationLog, field: string) {
  return (log.changes[field] || {}) as Change
}

function subject(log: ProjectOperationLog, field: string) {
  return (log.changes[field] || {}) as SubjectSnapshot
}

function text(value: unknown) {
  const none = t("activity.none")
  if (typeof value === "string") return value || none
  if (typeof value === "number") return String(value)
  return none
}

function describeLog(log: ProjectOperationLog) {
  const unknown = t("common.unknown")
  switch (log.action) {
    case "transfer_owner": {
      const owner = log.changes.owner as
        { from?: OwnerSnapshot; to?: OwnerSnapshot } | undefined
      return [
        t("activity.project.transferOwner", {
          from: owner?.from?.name || unknown,
          to: owner?.to?.name || unknown,
        }),
      ]
    }
    case "update_project": {
      const descriptions: string[] = []
      const name = change(log, "name")
      if (name.from !== undefined || name.to !== undefined) {
        descriptions.push(
          t("activity.project.renamed", { from: text(name.from), to: text(name.to) })
        )
      }
      if (change(log, "description").changed) {
        descriptions.push(t("activity.project.descUpdated"))
      }
      const archived = change(log, "archived")
      if (archived.to === true) {
        descriptions.push(t("activity.project.archived"))
      } else if (archived.to === false) {
        descriptions.push(t("activity.project.restored"))
      }
      return descriptions
    }
    case "create_state":
      return [t("activity.project.stateAdded", { name: subject(log, "state").name || unknown })]
    case "delete_state":
      return [t("activity.project.stateRemoved", { name: subject(log, "state").name || unknown })]
    case "update_state": {
      const state = subject(log, "state").name || unknown
      const descriptions: string[] = []
      const name = change(log, "name")
      if (name.from !== undefined || name.to !== undefined) {
        descriptions.push(
          t("activity.project.stateRenamed", { from: text(name.from), to: text(name.to) })
        )
      }
      if (change(log, "color").from !== undefined) {
        descriptions.push(t("activity.project.stateColor", { name: state }))
      }
      const category = change(log, "category")
      if (category.from !== undefined || category.to !== undefined) {
        descriptions.push(
          t("activity.project.stateCategory", {
            name: state,
            from: text(category.from),
            to: text(category.to),
          })
        )
      }
      if (change(log, "sort_order").from !== undefined) {
        descriptions.push(t("activity.project.stateReordered", { name: state }))
      }
      return descriptions
    }
    case "create_label":
      return [t("activity.project.labelAdded", { name: subject(log, "label").name || unknown })]
    case "delete_label":
      return [t("activity.project.labelRemoved", { name: subject(log, "label").name || unknown })]
    case "update_label": {
      const label = subject(log, "label").name || unknown
      const descriptions: string[] = []
      const name = change(log, "name")
      if (name.from !== undefined || name.to !== undefined) {
        descriptions.push(
          t("activity.project.labelRenamed", { from: text(name.from), to: text(name.to) })
        )
      }
      if (change(log, "color").from !== undefined) {
        descriptions.push(t("activity.project.labelColor", { name: label }))
      }
      return descriptions
    }
    case "add_member": {
      const member = subject(log, "member")
      return [
        t("activity.project.memberAdded", {
          name: member.name || unknown,
          role: member.role || t("activity.project.memberRole"),
        }),
      ]
    }
    case "remove_member": {
      const member = subject(log, "member")
      return [t("activity.project.memberRemoved", { name: member.name || unknown })]
    }
    case "update_member": {
      const member = subject(log, "member")
      const role = change(log, "role")
      return [
        t("activity.project.memberRole2", {
          name: member.name || unknown,
          from: text(role.from),
          to: text(role.to),
        }),
      ]
    }
  }
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

export function ProjectActivity({ projectId }: { projectId: string }) {
  useTranslation()
  const [logs, setLogs] = useState<ProjectOperationLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    const filter = pb.filter("project = {:projectId}", { projectId })

    const connect = async () => {
      try {
        const records = await pb
          .collection("board_project_operation_logs")
          .getFullList<ProjectOperationLogRecord>({
            filter,
            sort: "-created",
            expand: "actor",
            requestKey: null,
          })
        if (active) setLogs(records.map(toProjectOperationLog))

        unsubscribe = await pb
          .collection("board_project_operation_logs")
          .subscribe<ProjectOperationLogRecord>(
            "*",
            (event) => {
              if (!active) return
              const log = toProjectOperationLog(event.record)
              setLogs((current) =>
                [log, ...current.filter((item) => item.id !== log.id)].sort(
                  (a, b) =>
                    new Date(b.created).getTime() -
                    new Date(a.created).getTime()
                )
              )
            },
            { filter, expand: "actor", requestKey: null }
          )
      } catch (error) {
        if (error instanceof ClientResponseError && error.isAbort) return
      } finally {
        if (active) setLoading(false)
      }
    }

    void connect()
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [projectId])

  return (
    <div className="flex flex-col gap-3 border-t pt-5">
      <div>
        <p className="text-sm font-medium">{t("activity.projectTitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("activity.projectDesc")}
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">{t("activity.loading")}</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("activity.projectEmpty")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {logs.map((log) => (
            <div key={log.id} className="flex gap-3">
              <Avatar size="sm">
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
