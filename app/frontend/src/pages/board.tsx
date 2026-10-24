import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useTranslation } from "react-i18next"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Archive02Icon,
  KanbanIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { ArchivedProjectsDialog } from "@/components/board/archived-projects-dialog"
import { KanbanBoard } from "@/components/board/kanban-board"
import { ProjectGrid } from "@/components/board/project-grid"
import { ProjectSheet } from "@/components/board/project-sheet"
import {
  requestedRecordId,
  workspaceRecordUrl,
} from "@/lib/workspace-navigation"
import { useBoardStore, type Project } from "@/store/board"

export function BoardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedTaskId = requestedRecordId(searchParams) || undefined
  const [projectSheetOpen, setProjectSheetOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [resolvedTaskId, setResolvedTaskId] = useState<string | undefined>()
  const initialized = useBoardStore((state) => state.initialized)
  const openProject = useBoardStore((state) => state.openProject)
  const openTask = useBoardStore((state) => state.openTask)
  const clearOpenedRecord = useBoardStore((state) => state.clearOpenedRecord)
  const loadProjectPage = useBoardStore((state) => state.loadProjectPage)
  const projectPage = useBoardStore((state) => state.projectPage)
  const focusedProjectId = useBoardStore((state) => state.focusedProjectId)
  const focusProject = useBoardStore((state) => state.focusProject)
  const focusedName = useBoardStore(
    (state) => state.projects.find((p) => p.id === state.focusedProjectId)?.name
  )
  const projectCount = useBoardStore((state) => state.projectTotalItems)

  useEffect(() => {
    if (!initialized || !requestedTaskId) return
    let active = true
    void openTask(requestedTaskId).then(async (task) => {
      if (!active) return
      if (task) {
        if (task.projectId !== useBoardStore.getState().focusedProjectId) {
          await focusProject(task.projectId)
        }
        setResolvedTaskId(task.id)
        return
      }
      const project = await openProject(requestedTaskId)
      if (!active) return
      if (!project) {
        clearOpenedRecord()
        navigate("/board", { replace: true })
        return
      }
      clearOpenedRecord()
      setResolvedTaskId(undefined)
      setEditingProject(project)
      setProjectSheetOpen(true)
    })
    return () => {
      active = false
    }
  }, [
    clearOpenedRecord,
    focusProject,
    initialized,
    navigate,
    openProject,
    openTask,
    requestedTaskId,
  ])

  const handleAddProject = () => {
    setEditingProject(null)
    setProjectSheetOpen(true)
  }

  const handleEditProject = (project: Project) => {
    setEditingProject(project)
    setProjectSheetOpen(true)
    navigate(workspaceRecordUrl("board", project.id), { replace: true })
  }

  const handleProjectSheetOpenChange = (open: boolean) => {
    setProjectSheetOpen(open)
    if (!open && editingProject) {
      clearOpenedRecord()
      navigate("/board", { replace: true })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HugeiconsIcon
                icon={KanbanIcon}
                strokeWidth={2}
                className="size-4"
              />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("board.title")}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("board.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setArchivedOpen(true)}
            aria-label={t("board.viewArchived")}
          >
            <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
          </Button>
          <Button variant="secondary" size="sm" onClick={handleAddProject}>
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              className="size-4"
            />
            {t("board.addProject")}
          </Button>
        </div>
      </div>

      {focusedProjectId ? (
        <>
          <div className="-mb-3 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void focusProject(null)}
            >
              {t("board.allProjects")}
            </Button>
            {focusedName && (
              <span className="text-sm font-medium">{focusedName}</span>
            )}
          </div>
          <KanbanBoard
            onEditProject={handleEditProject}
            requestedTaskId={resolvedTaskId}
          />
        </>
      ) : (
        <ProjectGrid
          onOpen={(id) => void focusProject(id)}
          reloadKey={projectCount}
        />
      )}

      <ProjectSheet
        key={editingProject?.id || "new"}
        open={projectSheetOpen}
        onOpenChange={handleProjectSheetOpenChange}
        project={editingProject}
      />

      <ArchivedProjectsDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
        onChanged={() => loadProjectPage(projectPage)}
      />
    </div>
  )
}
