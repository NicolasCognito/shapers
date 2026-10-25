import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { format, formatDistanceToNowStrict, parseISO } from "date-fns"
import { notify } from "@/lib/notify"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, QrCodeIcon, UserGroupIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { MeetingQrDialog } from "@/components/team/meeting-qr"
import { useDateLocale } from "@/i18n"
import { extractErrorMessage } from "@/lib/error"
import { can } from "@/lib/permissions"
import { teamApi, type MeetingView } from "@/lib/team"
import { cn } from "@/lib/utils"

const HIDDEN_KEY = "shapers.meetingBarHidden" // sessionStorage: meeting ids closed with ×

function readHidden(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(HIDDEN_KEY) ?? "[]")
  } catch {
    return []
  }
}

/**
 * Strip under the header on every page while a meeting is open for clock-in
 * (30 min before to 30 min after). Members clock in with one tap; admins
 * also get roll call and the QR code for the room screen.
 */
export function MeetingNowBar() {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const navigate = useNavigate()
  const admin = can("attendance.record")
  const [meetings, setMeetings] = useState<MeetingView[]>([])
  const [hidden, setHidden] = useState<string[]>(readHidden)
  const [busy, setBusy] = useState<string | null>(null)
  const [qr, setQr] = useState<MeetingView | null>(null)

  const load = useCallback(() => {
    teamApi
      .upcoming()
      .then((list) => setMeetings(list.filter((m) => m.can_check_in)))
      .catch(() => {})
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    window.addEventListener("focus", load)
    window.addEventListener("hours-changed", load)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", load)
      window.removeEventListener("hours-changed", load)
    }
  }, [load])

  const hide = (id: string) => {
    const next = [...hidden, id]
    setHidden(next)
    try {
      sessionStorage.setItem(HIDDEN_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const checkin = async (m: MeetingView, remote: boolean) => {
    setBusy(m.id)
    try {
      await teamApi.checkin(m.id, remote)
      notify.success(remote ? t("memberDetail.joinedRemote") : t("memberDetail.youreIn"))
      window.dispatchEvent(new Event("hours-changed")) // My week reloads too
    } catch (e) {
      notify.error(extractErrorMessage(e, t("common.somethingWrong")))
    } finally {
      setBusy(null)
    }
  }

  // Members see their meetings; admins also see meetings they can roll-call.
  const shown = meetings.filter((m) => !hidden.includes(m.id) && (m.member || admin))
  if (shown.length === 0) return <MeetingQrDialog meeting={qr} onClose={() => setQr(null)} />

  const now = new Date()
  const when = (m: MeetingView) => {
    const start = parseISO(m.start)
    const end = parseISO(m.end)
    if (now < start) return t("checkin.startsIn", { time: formatDistanceToNowStrict(start, { locale }) })
    if (now > end) return t("checkin.endedAgo", { time: formatDistanceToNowStrict(end, { locale }) })
    return t("checkin.now")
  }

  return (
    <>
      <div className="space-y-px border-b bg-emerald-500/10">
        {shown.map((m) => {
          const done = m.state === "present" || m.state === "remote"
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 md:px-6">
              <span className="relative flex size-2.5 shrink-0" aria-hidden>
                {!done && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />}
                <span className="relative size-2.5 rounded-full bg-emerald-500" />
              </span>
              <div className="min-w-48 flex-1 text-sm leading-tight">
                <p className="truncate font-medium">
                  {when(m)} · {m.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {format(parseISO(m.start), "HH:mm")}–{format(parseISO(m.end), "HH:mm")}
                  {m.location && ` · ${m.location}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {m.member &&
                  (done ? (
                    <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      ✓ {m.state === "remote" ? t("checkin.doneRemote") : t("checkin.doneHere")}
                    </span>
                  ) : (
                    <>
                      <Button size="sm" className="h-9 px-4" disabled={busy === m.id} onClick={() => void checkin(m, false)}>
                        {t("memberDetail.imHere")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 bg-background"
                        disabled={busy === m.id}
                        onClick={() => void checkin(m, true)}
                      >
                        {t("memberDetail.remote")}
                      </Button>
                    </>
                  ))}
                {admin && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 bg-background"
                      onClick={() => navigate(`/team?rollcall=${m.id}`)}
                    >
                      <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} />
                      {t("checkin.rollCall")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 bg-background"
                      onClick={() => setQr(m)}
                      aria-label={t("checkin.showQr")}
                      title={t("checkin.showQr")}
                    >
                      <HugeiconsIcon icon={QrCodeIcon} strokeWidth={2} />
                      <span className="hidden sm:inline">QR</span>
                    </Button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => hide(m.id)}
                  className={cn("rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground")}
                  aria-label={t("checkin.hide")}
                  title={t("checkin.hide")}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <MeetingQrDialog meeting={qr} onClose={() => setQr(null)} />
    </>
  )
}
