import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserAdd01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
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
import { Switch } from "@/components/ui/switch"
import { extractErrorMessage } from "@/lib/error"
import { SERIES, teamApi, type MemberSummary } from "@/lib/team"
import { cn } from "@/lib/utils"

const TIERS = ["GO!", "Impact", "Core"] as const

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const a = new Uint32Array(10)
  crypto.getRandomValues(a)
  return Array.from(a, (n) => chars[n % chars.length]).join("")
}

/** Most common weekly commitment per tier among current members. */
function typicalHours(members: MemberSummary[]) {
  const out: Record<string, number> = {}
  for (const tier of TIERS) {
    const count = new Map<number, number>()
    for (const m of members) if (m.tier === tier) count.set(m.weekly_hours, (count.get(m.weekly_hours) ?? 0) + 1)
    out[tier] = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  }
  return out
}

/**
 * Admin adds a member by hand: the account exists right away, the admin
 * passes the sign-in details on. Series decide which meetings they're in
 * (Community is everyone).
 */
export function AddMemberButton({ members, onAdded }: { members: MemberSummary[]; onAdded: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [tier, setTier] = useState<string>("GO!")
  const [hours, setHours] = useState("")
  const [admin, setAdmin] = useState(false)
  const [jarvis, setJarvis] = useState(false)
  const [series, setSeries] = useState<string[]>([])
  const [password, setPassword] = useState(randomPassword)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ email: string; password: string; meetings: number } | null>(null)
  const typical = useMemo(() => typicalHours(members), [members])

  const reset = () => {
    setName("")
    setEmail("")
    setTier("GO!")
    setHours("")
    setAdmin(false)
    setJarvis(false)
    setSeries([])
    setPassword(randomPassword())
    setDone(null)
  }

  const valid = name.trim() && /\S+@\S+\.\S+/.test(email) && password.length >= 8

  const submit = async () => {
    setBusy(true)
    try {
      const r = await teamApi.createMember({
        name: name.trim(),
        email: email.trim(),
        password,
        tier,
        weekly_hours: hours ? Number(hours) : undefined,
        is_admin: admin,
        jarvis_enabled: admin || jarvis,
        series,
      })
      setDone({ email: email.trim().toLowerCase(), password, meetings: r.meetings })
      onAdded()
    } catch (e) {
      toast.error(extractErrorMessage(e, t("common.couldNotSave")))
    } finally {
      setBusy(false)
    }
  }

  const credentials = done
    ? t("addMember.credentialsText", { url: window.location.origin, email: done.email, password: done.password })
    : ""

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} />
        {t("addMember.button")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) reset()
        }}
      >
        <DialogContent className="sm:max-w-md">
          {done ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("addMember.doneTitle", { name })}</DialogTitle>
                <DialogDescription>{t("addMember.doneHint", { count: done.meetings })}</DialogDescription>
              </DialogHeader>
              <pre className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{credentials}</pre>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={reset}>
                  {t("addMember.addAnother")}
                </Button>
                <Button
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(credentials)
                      .then(() => toast.success(t("addMember.copied")))
                      .catch(() => {})
                  }
                >
                  {t("addMember.copy")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (valid && !busy) void submit()
              }}
            >
              <DialogHeader>
                <DialogTitle>{t("addMember.title")}</DialogTitle>
                <DialogDescription>{t("addMember.desc")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="am-name">{t("addMember.name")}</Label>
                  <Input id="am-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="am-email">Email</Label>
                  <Input id="am-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("addMember.tier")}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {TIERS.map((tn) => (
                    <Button
                      key={tn}
                      type="button"
                      size="sm"
                      variant={tier === tn ? "default" : "outline"}
                      onClick={() => setTier(tn)}
                    >
                      {tn}
                    </Button>
                  ))}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      inputMode="decimal"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      placeholder={String(typical[tier] || "")}
                      className="h-8 w-20"
                      aria-label={t("addMember.hoursPerWeek")}
                    />
                    <span className="text-xs text-muted-foreground">{t("addMember.hoursPerWeek")}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("addMember.series")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {SERIES.filter((s) => s !== "Community").map((s) => {
                    const on = series.includes(s)
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSeries((cur) => (on ? cur.filter((x) => x !== s) : [...cur, s]))}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {s}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{t("addMember.communityNote")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="am-pass">{t("addMember.password")}</Label>
                <div className="flex gap-2">
                  <Input id="am-pass" value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                  <Button type="button" variant="outline" onClick={() => setPassword(randomPassword())}>
                    {t("addMember.generate")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("addMember.passwordHint")}</p>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span>
                  <span className="font-medium">{t("addMember.admin")}</span>
                  <span className="block text-xs text-muted-foreground">{t("addMember.adminHint")}</span>
                </span>
                <Switch checked={admin} onCheckedChange={setAdmin} />
              </label>
              {!admin && (
                <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <span>
                    <span className="font-medium">{t("jarvisAccess.label")}</span>
                    <span className="block text-xs text-muted-foreground">{t("jarvisAccess.hint")}</span>
                  </span>
                  <Switch checked={jarvis} onCheckedChange={setJarvis} />
                </label>
              )}
              <DialogFooter>
                <Button type="submit" disabled={!valid || busy}>
                  {t("addMember.submit")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
