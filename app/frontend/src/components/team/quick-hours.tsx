import { useState } from "react"
import { useTranslation } from "react-i18next"
import { addDays } from "date-fns"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Clock01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { extractErrorMessage } from "@/lib/error"
import { pb } from "@/lib/pocketbase"
import { fmtHours, teamApi } from "@/lib/team"
import { cn } from "@/lib/utils"

const CHIPS = [0.5, 1, 2, 3, 4, 8]

/**
 * "+ hours" in the header: log today's (or yesterday's) hours from any page
 * in two taps. The note is optional; Undo is in the toast.
 */
export function QuickHours() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [yesterday, setYesterday] = useState(false)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const me = pb.authStore.record?.id

  if (!me) return null

  const log = async (h: number) => {
    setBusy(true)
    try {
      const day = addDays(new Date(), yesterday ? -1 : 0)
      day.setHours(12, 0, 0, 0)
      const rec = await teamApi.logHours(me, day, h, note.trim())
      window.dispatchEvent(new Event("hours-changed"))
      toast.success(t("quickHours.logged", { hours: fmtHours(h), day: yesterday ? t("quickHours.yesterday") : t("quickHours.today") }), {
        action: {
          label: t("quickHours.undo"),
          onClick: () =>
            void teamApi
              .deleteLog(rec.id)
              .then(() => window.dispatchEvent(new Event("hours-changed")))
              .catch(() => {}),
        },
      })
      setNote("")
      setYesterday(false)
      setOpen(false)
    } catch (e) {
      toast.error(extractErrorMessage(e, t("common.somethingWrong")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" title={t("quickHours.title")} aria-label={t("quickHours.title")}>
          <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4" />
          <span className="text-xs font-semibold">+h</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("quickHours.title")}</p>
          <div className="flex rounded-full border p-0.5 text-xs">
            {[false, true].map((y) => (
              <button
                key={String(y)}
                type="button"
                onClick={() => setYesterday(y)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 transition-colors",
                  yesterday === y ? "bg-foreground text-background" : "text-muted-foreground"
                )}
              >
                {y ? t("quickHours.yesterday") : t("quickHours.today")}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CHIPS.map((h) => (
            <Button key={h} variant="secondary" className="h-10" disabled={busy} onClick={() => void log(h)}>
              +{fmtHours(h)}
            </Button>
          ))}
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("memberDetail.notePlaceholder")}
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">{t("quickHours.hint")}</p>
      </PopoverContent>
    </Popover>
  )
}
