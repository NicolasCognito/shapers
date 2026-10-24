import { useTranslation } from "react-i18next"

import { setLanguage, type Lang } from "@/i18n"
import { cn } from "@/lib/utils"

// Inline SVG flags: Windows does not render flag emoji.
function FlagGB() {
  return (
    <svg viewBox="0 0 60 30" className="size-4 rounded-full object-cover" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <clipPath id="gb-c">
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#gb-c)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  )
}

function FlagSI() {
  return (
    <svg viewBox="0 0 12 6" className="size-4 rounded-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="12" height="2" fill="#fff" />
      <rect y="2" width="12" height="2" fill="#0000ff" />
      <rect y="4" width="12" height="2" fill="#ff0000" />
      {/* simplified coat of arms */}
      <g transform="translate(1.6 0)">
        <path d="M2.4,0.9 h1.6 v1.5 q0,0.9 -0.8,1.3 q-0.8,-0.4 -0.8,-1.3 z" fill="#0000ff" stroke="#ff0000" strokeWidth="0.15" />
        <path d="M2.7,2.6 l0.5,-0.8 l0.5,0.8 z" fill="#fff" />
      </g>
    </svg>
  )
}

const OPTIONS: { lang: Lang; label: string; Flag: () => React.JSX.Element }[] = [
  { lang: "en", label: "EN", Flag: FlagGB },
  { lang: "sl", label: "SL", Flag: FlagSI },
]

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const current: Lang = i18n.language?.startsWith("sl") ? "sl" : "en"
  return (
    <div
      role="radiogroup"
      aria-label={t("common.language")}
      className={cn("inline-flex rounded-full border bg-muted/40 p-0.5", className)}
    >
      {OPTIONS.map(({ lang, label, Flag }) => {
        const active = current === lang
        return (
          <button
            key={lang}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLanguage(lang)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-emerald-500 text-white shadow-sm dark:bg-emerald-600"
                : "text-muted-foreground opacity-70 hover:opacity-100"
            )}
          >
            <Flag />
            {label}
          </button>
        )
      })}
    </div>
  )
}
