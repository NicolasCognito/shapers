import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon } from "@hugeicons/core-free-icons"

import { Switch } from "@/components/ui/switch"
import { extractErrorMessage } from "@/lib/error"
import { teamApi } from "@/lib/team"

/** Admin switch in the member sheet: show the Jarvis button to this member. */
export function JarvisToggle({ userId, initial, onChanged }: { userId: string; initial: boolean; onChanged?: () => void }) {
  const { t } = useTranslation()
  const [on, setOn] = useState(initial)
  const toggle = async (next: boolean) => {
    setOn(next)
    try {
      await teamApi.setJarvis(userId, next)
      onChanged?.()
    } catch (e) {
      setOn(!next)
      toast.error(extractErrorMessage(e, t("common.couldNotSave")))
    }
  }
  return (
    // Only the switch toggles (not the whole row); no toast — the switch shows the state.
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
      <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-4 text-violet-600" />
      <span className="flex-1">
        <span className="font-medium">{t("jarvisAccess.label")}</span>
        <span className="block text-xs text-muted-foreground">{t("jarvisAccess.hint")}</span>
      </span>
      <Switch checked={on} onCheckedChange={(v) => void toggle(v)} aria-label={t("jarvisAccess.label")} />
    </div>
  )
}
