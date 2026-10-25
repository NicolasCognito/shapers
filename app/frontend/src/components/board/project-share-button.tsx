import { Trans, useTranslation } from "react-i18next"

import i18n from "@/i18n"
import { useEffect, useState } from "react"
import { notify } from "@/lib/notify"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  LinkSquare02Icon,
  Share01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"
import type { Project } from "@/store/board"

type ProjectShare = {
  projectId: string
  slug: string
  expires?: string
  created: string
  updated: string
}

/** "keep" leaves an existing expiry untouched while other fields change. */
type ShareExpiry = "keep" | "never" | "7" | "30"

/**
 * Publishes a project as a public preview. Unlike a shared document, the link
 * always shows the project as it stands, so there is no revision to publish
 * again — only an expiry to set and a link to revoke. The share is loaded on
 * mount rather than when the dialog opens, so the icon can already report that
 * this project is public.
 */
export function ShareProjectButton({ project }: { project: Project }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // Tied to the project it describes, so a re-render for another project never
  // shows the previous project's link as if it were this one's.
  const [loaded, setLoaded] = useState<{
    projectId: string
    share: ProjectShare | null
  } | null>(null)
  const [expiry, setExpiry] = useState<ShareExpiry>("never")
  const [chineseDates, setChineseDates] = useState(false)
  const [working, setWorking] = useState(false)
  const current = loaded?.projectId === project.id ? loaded : null
  const share = current?.share ?? null

  useEffect(() => {
    let active = true
    void pb
      .send<ProjectShare | null>(`/api/board/projects/${project.id}/share`, {})
      .then((existing) => {
        if (!active) return
        setLoaded({ projectId: project.id, share: existing })
        setExpiry(existing?.expires ? "keep" : "never")
      })
      .catch(() => {
        // A project that cannot report its share simply shows an unshared
        // icon; the dialog surfaces any real failure when it is opened.
      })
    return () => {
      active = false
    }
  }, [project.id])

  const publish = async (nextExpiry: ShareExpiry) => {
    setWorking(true)
    try {
      const updated = await pb.send<ProjectShare>(
        `/api/board/projects/${project.id}/share`,
        {
          method: "POST",
          body: { expires: shareExpiryValue(nextExpiry, share) },
        }
      )
      setLoaded({ projectId: project.id, share: updated })
      setExpiry(updated.expires ? "keep" : "never")
      notify.success(share ? t("share.updated") : t("share.created"))
    } catch {
      notify.error(t("share.updateFailed"))
    } finally {
      setWorking(false)
    }
  }

  const revoke = async () => {
    setWorking(true)
    try {
      await pb.send(`/api/board/projects/${project.id}/share`, {
        method: "DELETE",
      })
      setLoaded({ projectId: project.id, share: null })
      setExpiry("never")
      notify.success(t("share.revoked"))
    } catch {
      notify.error(t("share.revokeFailed"))
    } finally {
      setWorking(false)
    }
  }

  // The language parameter only formats dates, so it belongs to the link the
  // owner hands out rather than to the share record.
  const url = share
    ? `${window.location.origin}/p/${share.slug}${chineseDates ? "?lang=zh" : ""}`
    : ""

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      notify.success(t("share.copied"))
    } catch {
      notify.error(t("share.copyFailed"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={
                share
                  ? t("share.sharedNamed", { name: project.name })
                  : t("share.shareProject")
              }
              onClick={() => setOpen(true)}
              className={cn(
                share && "text-emerald-500 hover:text-emerald-500"
              )}
            >
              <HugeiconsIcon icon={Share01Icon} strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {share ? t("share.sharedPublicly") : t("share.shareProject")}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("share.shareProject")}</DialogTitle>
          <DialogDescription>
            {t("share.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{t("share.visible")}</span>{" "}
            {t("share.visibleList")}
          </p>
          <p className="mt-1">
            <span className="font-medium text-foreground">{t("share.notVisible")}</span>{" "}
            {t("share.notVisibleList")}
          </p>
          <p className="mt-1">
            {t("share.takedown")}
          </p>
        </div>

        {!current ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-5" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {share && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={url}
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("share.copyLink")}
                    title={t("share.copyLink")}
                    onClick={() => void copy()}
                  >
                    <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("share.openNewTab")}
                    title={t("share.openNewTab")}
                    onClick={() =>
                      window.open(url, "_blank", "noopener,noreferrer")
                    }
                  >
                    <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} />
                  </Button>
                </div>
                <Label className="flex items-start gap-2 text-xs font-normal text-muted-foreground">
                  <Checkbox
                    checked={chineseDates}
                    onCheckedChange={(value) => setChineseDates(value === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <Trans
                      i18nKey="share.zhDates"
                      components={{ code: <code className="font-mono" /> }}
                    />
                  </span>
                </Label>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label>{t("share.expires")}</Label>
              <Select
                value={expiry}
                onValueChange={(value) => {
                  const next = value as ShareExpiry
                  setExpiry(next)
                  if (share) void publish(next)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {share?.expires && (
                    <SelectItem value="keep">
                      {formatShareExpiry(share.expires, t)}
                    </SelectItem>
                  )}
                  <SelectItem value="never">{t("share.noExpiry")}</SelectItem>
                  <SelectItem value="7">{t("share.in7")}</SelectItem>
                  <SelectItem value="30">{t("share.in30")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          {share ? (
            <Button
              variant="outline"
              disabled={working}
              onClick={() => void revoke()}
              title={t("share.revokeHint")}
            >
              {t("share.revoke")}
            </Button>
          ) : (
            <Button
              disabled={working || !current}
              onClick={() => void publish(expiry)}
            >
              {working ? t("share.creating") : t("share.create")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function shareExpiryValue(
  expiry: ShareExpiry,
  share: ProjectShare | null
): string {
  if (expiry === "keep") return share?.expires ?? ""
  if (expiry === "never") return ""
  const expires = new Date()
  expires.setDate(expires.getDate() + Number(expiry))
  return expires.toISOString()
}

function formatShareExpiry(
  value: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const parsed = new Date(value.replace(" ", "T"))
  if (Number.isNaN(parsed.getTime())) return t("share.keepExpiry")
  return t("share.keepDate", { date: parsed.toLocaleDateString(i18n.language) })
}
