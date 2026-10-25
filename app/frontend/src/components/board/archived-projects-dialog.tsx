import { useTranslation } from "react-i18next"
import { useCallback, useEffect, useState } from "react"

import {
  Archive02Icon,
  ArchiveRestoreIcon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { RecordModel } from "pocketbase"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Spinner } from "@/components/ui/spinner"
import { extractErrorMessage, isRequestAbort } from "@/lib/error"
import { pb } from "@/lib/pocketbase"

type ArchivedProjectRecord = RecordModel & {
  name: string
  description: string
  owner: string
}

export function ArchivedProjectsDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [items, setItems] = useState<ArchivedProjectRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] =
    useState<ArchivedProjectRecord | null>(null)

  const load = useCallback(async () => {
    const result = await pb
      .collection("board_projects")
      .getList<ArchivedProjectRecord>(page, 10, {
        filter: "archived = true",
        sort: "-updated",
        fields: "id,name,description,owner,updated",
      })
    setItems(result.items)
    setTotalPages(Math.max(1, result.totalPages))
  }, [page])

  useEffect(() => {
    if (!open) return
    void Promise.resolve()
      .then(load)
      .catch((error) => {
        if (isRequestAbort(error)) return
        notify.error(
          extractErrorMessage(error, t("archivedProjects.loadFailed"))
        )
      })
      .finally(() => setLoading(false))
  }, [load, open, t])

  const restore = async (id: string) => {
    try {
      await pb.send(`/api/board/projects/${id}/unarchive`, {
        method: "POST",
      })
      await Promise.all([load(), onChanged()])
      notify.success(t("archivedProjects.restored"))
    } catch (error) {
      notify.error(extractErrorMessage(error, t("archivedProjects.restoreFailed")))
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    try {
      await pb.collection("board_projects").delete(deleteTarget.id)
      setDeleteTarget(null)
      await Promise.all([load(), onChanged()])
      notify.success(t("archivedProjects.deleted"))
    } catch (error) {
      notify.error(extractErrorMessage(error, t("archivedProjects.deleteFailed")))
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (value) setPage(1)
          onOpenChange(value)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={Archive02Icon} className="size-4" />
              {t("archivedProjects.title")}
            </DialogTitle>
            <DialogDescription>
              {t("archivedProjects.desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="no-scrollbar max-h-[50vh] space-y-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t("archivedProjects.empty")}
              </p>
            ) : (
              items.map((project) => {
                const isOwner = project.owner === pb.authStore.record?.id
                return (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {project.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {project.description ||
                          (isOwner ? t("archivedProjects.ownedByYou") : t("archivedProjects.shared"))}
                      </p>
                    </div>
                    {isOwner && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("archivedProjects.restore")}
                          onClick={() => void restore(project.id)}
                        >
                          <HugeiconsIcon
                            icon={ArchiveRestoreIcon}
                            strokeWidth={2}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("projectColumn.deleteProject")}
                          onClick={() => setDeleteTarget(project)}
                        >
                          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                        </Button>
                      </>
                    )}
                  </div>
                )
              })
            )}
          </div>
          {!loading && items.length > 0 && (
            <Pagination className="justify-end pt-2">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    text={t("notifications.prev")}
                    onClick={() => {
                      setLoading(true)
                      setPage((value) => Math.max(1, value - 1))
                    }}
                    className={
                      page <= 1 || loading
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
                <span className="flex items-center px-2 text-xs text-muted-foreground">
                  {page} / {Math.max(1, totalPages)}
                </span>
                <PaginationItem>
                  <PaginationNext
                    text={t("notifications.next")}
                    onClick={() => {
                      setLoading(true)
                      setPage((value) => Math.min(totalPages, value + 1))
                    }}
                    className={
                      page >= totalPages || loading
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(value) => !value && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("archivedProjects.deletePermTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("archivedProjects.deletePermDesc", { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void remove()}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
