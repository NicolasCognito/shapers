import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { format, parseISO, startOfDay } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import { QrCodeIcon, UserGroupIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MeetingQrDialog } from "@/components/team/meeting-qr"
import { useDateLocale } from "@/i18n"
import { teamApi, type MeetingView } from "@/lib/team"

const SHOWN = 6
const REFRESH_MS = 60_000

/**
 * Admin card on Team → Overview: today's and the next meetings, each with its
 * room QR code. Meetings that have started also get Roll call, so attendance
 * stays reachable after the meeting bar at the top is closed.
 */
export function UpcomingMeetingsCard({ onRollCall }: { onRollCall: (id: string) => void }) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const [list, setList] = useState<MeetingView[] | null>(null)
  const [qr, setQr] = useState<MeetingView | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const load = () =>
      teamApi
        .upcoming()
        .then((all) => {
          const today = startOfDay(new Date()).getTime()
          setList(all.filter((m) => parseISO(m.end).getTime() >= today).slice(0, SHOWN))
          setNow(Date.now())
        })
        .catch(() => setList([]))
    void load()
    const id = window.setInterval(() => void load(), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("team.upcomingMeetings")}</CardTitle>
        <CardDescription>{t("team.upcomingQrHint")}</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {list?.length === 0 && <p className="py-2 text-sm text-muted-foreground">{t("team.noUpcoming")}</p>}
        {list?.map((m) => {
          const started = parseISO(m.start).getTime() <= now
          const ended = parseISO(m.end).getTime() < now
          return (
            <div key={m.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{m.title}</span>
                <span className="text-xs text-muted-foreground">
                  {format(parseISO(m.start), "EEE d MMM, HH:mm", { locale })}
                  {m.can_check_in && (
                    <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">● {t("checkin.now")}</span>
                  )}
                  {ended && !m.can_check_in && <span className="ml-1.5">· {t("team.meetingEnded")}</span>}
                </span>
              </span>
              {(started || m.can_check_in) && (
                <Button size="sm" variant="outline" className="h-8" onClick={() => onRollCall(m.id)}>
                  <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} />
                  <span className="hidden sm:inline">{t("checkin.rollCall")}</span>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setQr(m)}
                aria-label={t("checkin.showQr")}
                title={t("checkin.showQr")}
              >
                <HugeiconsIcon icon={QrCodeIcon} strokeWidth={2} />
                QR
              </Button>
            </div>
          )
        })}
      </CardContent>
      <MeetingQrDialog meeting={qr} onClose={() => setQr(null)} />
    </Card>
  )
}
