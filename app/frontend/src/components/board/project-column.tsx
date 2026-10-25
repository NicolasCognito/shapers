import { Trans, useTranslation } from "react-i18next"
import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Archive02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  Copy01Icon,
  Delete02Icon,
  Layers02Icon,
  MoreHorizontalIcon,
  Settings02Icon,
  Tag01Icon,
  UserGroup02Icon,
} from "@hugeicons/core-free-icons"
import { notify } from "@/lib/notify"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { can } from "@/lib/permissions"
import { useAuthStore } from "@/store/auth"
import {
  PROJECTS_PER_PAGE,
  useBoardStore,
  type Project,
  type ProjectState,
  type Todo,
} from "@/store/board"
import { ArchivedTasksDialog } from "./archived-tasks-dialog"
import { ShareProjectButton } from "./project-share-button"
import { StatusColumn } from "./status-column"

type ProjectColumnProps = {
  project: Project
  states: ProjectState[]
  todos: Todo[]
  onAddTask: (projectId: string, stateId: string) => void
  onEditTask: (todo: Todo) => void
  onEditProject?: (project: Project) => void
}

export function ProjectColumn({
  project,
  states,
  todos,
  onAddTask,
  onEditTask,
  onEditProject,
}: ProjectColumnProps) {
  const { t } = useTranslation()
  const toggleCollapse = useBoardStore((store) => store.toggleProjectCollapse)
  const archiveProject = useBoardStore((store) => store.archiveProject)
  const removeProject = useBoardStore((store) => store.removeProject)
  const moveProject = useBoardStore((store) => store.moveProject)
  const archiveTodo = useBoardStore((store) => store.archiveTodo)
  const projects = useBoardStore((store) => store.projects)
  const projectPage = useBoardStore((store) => store.projectPage)
  const projectTotalItems = useBoardStore((store) => store.projectTotalItems)
  const loading = useBoardStore((store) => store.loading)
  const labels = useBoardStore((store) => store.labels)
  const members = useBoardStore((store) => store.members)
  const currentUser = useAuthStore((store) => store.user)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [archivedTasksOpen, setArchivedTasksOpen] = useState(false)

  const projectTodos = todos.filter((todo) => todo.projectId === project.id)
  const projectStates = [...states]
    .filter((state) => state.projectId === project.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const projectLabels = labels.filter((label) => label.projectId === project.id)
  const projectMembers = members.filter(
    (member) => member.projectId === project.id
  )
  const isOwner = currentUser?.id === project.ownerId
  // Admins may edit any project's settings and columns (server allows it too).
  const canEdit = isOwner || can("members.manage")
  const projectIndex = projects.findIndex((item) => item.id === project.id)
  const globalProjectIndex = projectPage * PROJECTS_PER_PAGE + projectIndex
  const canMoveUp = projectIndex >= 0 && globalProjectIndex > 0
  const canMoveDown =
    projectIndex >= 0 && globalProjectIndex < projectTotalItems - 1

  const copyProjectReference = async () => {
    try {
      await navigator.clipboard.writeText(
        `Projects:${project.id}:${project.name}`
      )
      notify.success(t("projectColumn.copied"))
    } catch {
      notify.error(t("projectColumn.copyFailed"))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void toggleCollapse(project.id).catch(() => {})}
          className="flex items-center gap-1.5 rounded-md px-1 py-1 transition-colors hover:bg-muted"
        >
          <HugeiconsIcon
            icon={project.collapsed ? ChevronRightIcon : ChevronDownIcon}
            strokeWidth={2}
            className="size-4 text-muted-foreground"
          />
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={Layers02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </div>
          <span className="text-sm font-semibold">{project.name}</span>
          <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
            <HugeiconsIcon
              icon={Layers02Icon}
              strokeWidth={2}
              className="size-3"
            />
            {projectTodos.length}
          </span>
          {projectLabels.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
              <HugeiconsIcon
                icon={Tag01Icon}
                strokeWidth={2}
                className="size-3"
              />
              {projectLabels.length}
            </span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
            <HugeiconsIcon
              icon={UserGroup02Icon}
              strokeWidth={2}
              className="size-3"
            />
            {projectMembers.length + 1}
          </span>
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={!canMoveUp || loading || !project.preferenceId}
            onClick={() => void moveProject(project.id, -1).catch(() => {})}
            aria-label={t("projectColumn.moveUp", { name: project.name })}
          >
            <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={!canMoveDown || loading || !project.preferenceId}
            onClick={() => void moveProject(project.id, 1).catch(() => {})}
            aria-label={t("projectColumn.moveDown", { name: project.name })}
          >
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("projectColumn.copyRef")}
                  onClick={() => void copyProjectReference()}
                >
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("projectColumn.copyRef")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("projectColumn.viewArchivedIn", { name: project.name })}
                  onClick={() => setArchivedTasksOpen(true)}
                >
                  <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("projectColumn.archivedTasks")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {canEdit && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("projectColumn.editProject")}
                    onClick={() => onEditProject?.(project)}
                  >
                    <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("projectColumn.editProject")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isOwner && <ShareProjectButton project={project} />}
          {isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("projectColumn.options")}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEditProject?.(project)}>
                  <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
                  {t("projectColumn.editProject")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void archiveProject(project.id).catch(() => {})
                  }
                >
                  <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
                  {t("projectColumn.archiveProject")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  {t("projectColumn.deleteProject")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {project.description && !project.collapsed && (
        <p className="px-1 text-xs text-muted-foreground">
          {project.description}
        </p>
      )}

      <div
        className={cn(
          "no-scrollbar flex gap-4 overflow-x-auto pb-2 transition-all",
          project.collapsed && "hidden"
        )}
      >
        {projectStates.map((state, index) => (
          <StatusColumn
            key={state.id}
            state={state}
            todos={projectTodos
              .filter((todo) => todo.stateId === state.id)
              .sort((a, b) => a.rank - b.rank)}
            onAddTask={(stateId) => onAddTask(project.id, stateId)}
            onEditTask={onEditTask}
            onArchiveTask={
              index === projectStates.length - 1
                ? (todo) => void archiveTodo(todo.id).catch(() => {})
                : undefined
            }
          />
        ))}

        {projectStates.length === 0 && (
          <div className="flex min-h-32 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-6 text-center">
            <div>
              <p className="text-sm font-medium">
                {t("projectColumn.noWorkflow")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("projectColumn.noWorkflowHint")}
              </p>
            </div>
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onEditProject?.(project)}
              >
                {t("projectColumn.editProject")}
              </Button>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projectColumn.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey="projectColumn.deleteDesc"
                count={projectTodos.length}
                values={{ name: project.name }}
                components={{ strong: <strong /> }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void removeProject(project.id).catch(() => {})}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ArchivedTasksDialog
        project={project}
        open={archivedTasksOpen}
        onOpenChange={setArchivedTasksOpen}
      />

    </div>
  )
}
