import { useTranslation } from "react-i18next"

import { LANGUAGES, setLanguage, type Lang } from "@/i18n"
import { cn } from "@/lib/utils"

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const current = i18n.language?.startsWith("sl") ? "sl" : "en"
  return (
    <select
      aria-label={t("common.language")}
      value={current}
      onChange={(e) => setLanguage(e.target.value as Lang)}
      className={cn(
        "h-7 rounded-md border bg-background px-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring",
        className
      )}
    >
      {LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {l.toUpperCase()}
        </option>
      ))}
    </select>
  )
}
