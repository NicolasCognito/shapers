import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Building03Icon,
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"

import { MemorySettingsCard } from "@/components/memory-settings-card"
import { useTheme } from "@/components/theme-provider"
import { LanguageCards } from "@/components/language-switcher"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { notify } from "@/lib/notify"
import { can, jarvisVisible } from "@/lib/permissions"
import { teamApi } from "@/lib/team"
import { cn } from "@/lib/utils"
import { usePreferencesStore } from "@/store/preferences"

// Only what members and admins change in the app. Server-level setup (LLM
// models, MCP servers, API keys) is done by whoever runs the server, via
// .env and the PocketBase dashboard, so it is not shown here.
export function SettingsPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("common.language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LanguageCards />
        </CardContent>
      </Card>

      <AppearanceCard />

      {can("members.manage") && <OrganisationCard />}

      {jarvisVisible() && <MemorySettingsCard />}
    </div>
  )
}

/** Organisation-wide switches (admins). Stored on the server, same for everyone. */
function OrganisationCard() {
  const { t } = useTranslation()
  const [meetingHours, setMeetingHours] = useState<boolean | null>(null)

  useEffect(() => {
    teamApi
      .settings()
      .then((s) => setMeetingHours(s.meeting_hours))
      .catch(() => setMeetingHours(null))
  }, [])

  const toggle = async (next: boolean) => {
    setMeetingHours(next)
    try {
      await teamApi.saveSettings({ meeting_hours: next })
    } catch {
      setMeetingHours(!next)
      notify.error(t("common.couldNotSave"))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon icon={Building03Icon} strokeWidth={2} className="size-4" />
          </div>
          <div>
            <CardTitle>{t("settings.orgTitle")}</CardTitle>
            <CardDescription>{t("settings.orgDesc")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
          <span className="flex-1">
            <span className="font-medium">{t("settings.meetingHours")}</span>
            <span className="block text-xs text-muted-foreground">{t("settings.meetingHoursHint")}</span>
          </span>
          {meetingHours !== null && (
            <Switch
              checked={meetingHours}
              onCheckedChange={(v) => void toggle(v)}
              aria-label={t("settings.meetingHours")}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const THEME_OPTIONS = [
  { value: "light" as const, labelKey: "settings.themeLight", icon: Sun03Icon },
  { value: "dark" as const, labelKey: "settings.themeDark", icon: Moon02Icon },
]

function AppearanceCard() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const persistTheme = usePreferencesStore((state) => state.updateTheme)

  const changeTheme = async (value: "light" | "dark" | "system") => {
    const previous = theme
    setTheme(value)
    try {
      await persistTheme(value)
    } catch {
      setTheme(previous)
      notify.error(t("settings.themeFailed"))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={ComputerIcon}
              strokeWidth={2}
              className="size-4"
            />
          </div>
          <div>
            <CardTitle>{t("settings.appearance")}</CardTitle>
            <CardDescription>
              {t("settings.appearanceDesc")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <Label>{t("settings.theme")}</Label>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((option) => {
              // "system" is no longer offered: highlight whatever it resolves to.
              const shown =
                theme === "system"
                  ? document.documentElement.classList.contains("dark")
                    ? "dark"
                    : "light"
                  : theme
              const active = shown === option.value
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void changeTheme(option.value)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <HugeiconsIcon
                    icon={Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                  {t(option.labelKey)}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings.themeHint")}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
