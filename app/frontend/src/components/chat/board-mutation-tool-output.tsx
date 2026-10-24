import { useTranslation } from "react-i18next"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChevronDownIcon,
  Edit01Icon,
  PlusSignIcon,
  KanbanIcon,
  Tag01Icon,
  UserGroupIcon,
  Layers01Icon,
} from "@hugeicons/core-free-icons"
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react"
import type { DynamicToolUIPart } from "ai"
import type { ReactNode } from "react"
import { useNavigate } from "react-router"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import { parseBatchToolResult } from "@/lib/tool-batch"

import { BatchToolResultSummary } from "./batch-tool-result"
import { ToolInput } from "./tool-input"

import i18n from "@/i18n"

// Module-level helpers translate at call time, so they follow the language.
const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, options)


type BoardMutationResult = {
  ok?: boolean
  action?: string
  changed?: boolean
  resourceType?: string
  id?: string
  name?: string
  projectId?: string
}

/** Maps each mutation tool name to a display label and icon. */
const toolMeta: Record<
  string,
  { label: string; icon: typeof Edit01Icon; fallback?: string }
> = {
  board_create_project: { label: "chat.boardTool.createProject", icon: PlusSignIcon },
  board_update_project: { label: "chat.boardTool.updateProject", icon: Edit01Icon },
  board_upsert_state: { label: "chat.boardTool.upsertState", icon: Layers01Icon },
  board_upsert_label: { label: "chat.boardTool.upsertLabel", icon: Tag01Icon },
  board_upsert_member: { label: "chat.boardTool.upsertMember", icon: UserGroupIcon },
  board_create_task: { label: "chat.boardTool.createTask", icon: PlusSignIcon },
  board_update_task: { label: "chat.boardTool.updateTask", icon: Edit01Icon },
}

const statusLabels: Partial<Record<DynamicToolUIPart["state"], string>> = {
  "input-available": "toolStatus.running",
  "input-streaming": "toolStatus.pending",
  "output-available": "toolStatus.completed",
  "output-error": "toolStatus.error",
}

const statusIcons: Partial<Record<DynamicToolUIPart["state"], ReactNode>> = {
  "input-available": <ClockIcon className="size-4 animate-pulse" />,
  "input-streaming": <CircleIcon className="size-4" />,
  "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
  "output-error": <XCircleIcon className="size-4 text-red-600" />,
}

function getStatusBadge(state: DynamicToolUIPart["state"]) {
  const icon = statusIcons[state]
  const label = statusLabels[state]
  if (!icon || !label) return null
  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {icon}
      {t(label)}
    </Badge>
  )
}

function parseResult(output: unknown): BoardMutationResult | null {
  if (typeof output === "string") {
    try {
      return JSON.parse(output) as BoardMutationResult
    } catch {
      return null
    }
  }
  return output && typeof output === "object"
    ? (output as BoardMutationResult)
    : null
}

function actionText(result: BoardMutationResult): string {
  const action = result.action || "updated"
  const resource = result.resourceType || "resource"
  return t("chat.boardTool.actionText", { action, resource })
}

export function BoardMutationToolCard({ part }: { part: DynamicToolUIPart }) {
  useTranslation()
  const navigate = useNavigate()
  const batch = parseBatchToolResult<BoardMutationResult>(part.output)
  const result = batch ? null : parseResult(part.output)
  const loading =
    part.state === "input-streaming" || part.state === "input-available"
  const failed = part.state === "output-error" || result?.ok === false
  const meta = toolMeta[part.toolName] ?? {
    label: "",
    fallback: part.toolName.replace(/^board_/, "").replace(/_/g, " "),
    icon: KanbanIcon,
  }
  const targetId =
    result?.resourceType === "project" || result?.resourceType === "task"
      ? result.id
      : result?.projectId

  return (
    <Collapsible
      defaultOpen={false}
      className="group not-prose mb-4 w-full rounded-md border"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-3 p-3",
          loading && "cursor-default"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon
            icon={meta.icon}
            strokeWidth={2}
            className={cn(
              "size-4 shrink-0",
              failed
                ? "text-destructive"
                : loading
                  ? "text-muted-foreground"
                  : "text-green-600"
            )}
          />
          <span className="text-sm font-medium">
            {meta.label ? t(meta.label) : meta.fallback}
          </span>
          {getStatusBadge(part.state)}
          {batch && <Badge variant="outline">{batch.total}</Badge>}
        </div>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-2 p-4 pt-0 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2">
        <ToolInput input={part.input} />

        {/* Loading */}
        {loading && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClockIcon className="size-3.5 animate-spin" />
              <span>{t("chat.boardTool.applying")}</span>
            </div>
          </div>
        )}

        {/* Error */}
        {failed && !loading && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || t("chat.boardTool.notSaved")}
          </div>
        )}

        {/* Success result */}
        {part.state === "output-available" && batch && (
          <BatchToolResultSummary
            batch={batch}
            getLabel={(item) =>
              `${item.name || item.id}${item.changed === false ? t("chat.boardTool.noChanges") : ""}`
            }
          />
        )}

        {!loading && !failed && result && (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircleIcon className="size-4 shrink-0 text-green-600" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {result.name || t("chat.boardTool.resource")}{" "}
                  <span className="font-normal text-muted-foreground">
                    {actionText(result)}
                  </span>
                </p>
                {result.id && (
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {result.resourceType} · {result.id}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() =>
                navigate(
                  targetId ? workspaceRecordUrl("board", targetId) : "/board"
                )
              }
            >
              {t("chat.boardTool.openBoard")}
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
