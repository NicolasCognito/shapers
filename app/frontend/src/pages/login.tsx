import { useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  EyeIcon,
  EyeOffIcon,
  LockKeyIcon,
  Mail02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ThemeToggle } from "@/components/theme-toggle"
import { Logo } from "@/components/logo"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useAuthStore } from "@/store/auth"

// TEMP for the demo: one-click sign-in as sandbox users.
// Set to false (or delete the block) before the final deploy — TODO 17.
const QUICK_LOGIN = true
const SANDBOX_PASSWORD = "shapers2026"
const QUICK_ACCOUNTS = [
  { labelKey: "login.quickAdmin", email: "ana.kovac@sandbox.example" },
  { labelKey: "login.quickMember", email: "zala.turk@sandbox.example" },
]

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  // Back to the page that sent us here (e.g. a check-in QR link).
  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from
  const back = from?.pathname && from.pathname !== "/login" ? from.pathname + (from.search ?? "") : "/dashboard"
  const login = useAuthStore((s) => s.login)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void signIn(email, password)
  }

  const signIn = async (email: string, password: string) => {
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate(back, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.loginFailed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background p-6">
      {/* Decorative background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background:radial-gradient(60%_50%_at_50%_0%,oklch(0.7_0.15_300)_0%,transparent_60%)] dark:[background:radial-gradient(60%_50%_at_50%_0%,oklch(0.4_0.15_300)_0%,transparent_60%)]"
      />

      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="mb-4 size-12" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("login.welcome")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t("login.subtitle")}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                {t("login.email")}
              </label>
              <div className="relative">
                <HugeiconsIcon
                  icon={Mail02Icon}
                  strokeWidth={2}
                  className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium">
                {t("login.password")}
              </label>
              <div className="relative">
                <HugeiconsIcon
                  icon={LockKeyIcon}
                  strokeWidth={2}
                  className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="px-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={
                    showPassword ? t("login.hidePassword") : t("login.showPassword")
                  }
                >
                  <HugeiconsIcon
                    icon={showPassword ? EyeOffIcon : EyeIcon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="mt-1 w-full" disabled={loading}>
              {loading ? t("login.signingIn") : t("login.signIn")}
            </Button>

            {QUICK_LOGIN && (
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACCOUNTS.map((a) => (
                  <Button
                    key={a.email}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => void signIn(a.email, SANDBOX_PASSWORD)}
                  >
                    {t(a.labelKey)}
                  </Button>
                ))}
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">
              {t("login.accountsNote")}
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
