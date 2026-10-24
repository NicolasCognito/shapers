import { useState } from "react"
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

const NAMES: Record<Lang, string> = { en: "English", sl: "Slovenščina" }

function useCurrentLang(): Lang {
  const { i18n } = useTranslation()
  return i18n.language?.startsWith("sl") ? "sl" : "en"
}

/** Big square choices for the Settings page. */
export function LanguageCards() {
  const current = useCurrentLang()
  return (
    <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
      {OPTIONS.map(({ lang, Flag }) => {
        const active = current === lang
        return (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            aria-pressed={active}
            className={cn(
              "flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 text-sm font-medium transition-colors",
              active
                ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted/50"
            )}
          >
            <span className="scale-[2.2]">
              <Flag />
            </span>
            <span className="mt-2">{NAMES[lang]}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Sidebar footer: a rectangle showing the language; click to unfold both choices. */
export function LanguageMenu({ className }: { className?: string }) {
  const { t } = useTranslation()
  const current = useCurrentLang()
  const [open, setOpen] = useState(false)
  const Current = OPTIONS.find((o) => o.lang === current)!
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-background/60", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("common.language")}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted/50"
      >
        <Current.Flag />
        <span className="flex-1 text-left">{NAMES[current]}</span>
        <span className={cn("text-muted-foreground transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && (
        <div className="border-t p-1">
          {OPTIONS.map(({ lang, Flag }) => (
            <button
              key={lang}
              type="button"
              onClick={() => {
                setLanguage(lang)
                setOpen(false)
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                current === lang ? "bg-emerald-500 font-medium text-white dark:bg-emerald-600" : "hover:bg-muted"
              )}
            >
              <Flag />
              {NAMES[lang]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
