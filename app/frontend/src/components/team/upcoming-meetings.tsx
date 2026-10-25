import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { format, parseISO } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import { QrCodeIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MeetingQrDialog } from "@/components/team/meeting-qr"
import { useDateLocale } from "@/i18n"
import { teamApi, type MeetingView } from "@/lib/team"

const SHOWN = 6

/**
 * Admin card on Team → Overview: the next meetings, each with its room QR
 * code, so it can be printed or put on the screen before the meeting starts.
 */
export function UpcomingMeetingsCard() {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const [list, setList] = useState<MeetingView[] | null>(null)
  const [qr, setQr] = useState<MeetingView | null>(null)

  useEffect(() => {
    teamApi
      .upcoming()
      .then((all) => {
        const now = Date.now()
        // Still useful while clock-in is open (until 30 min after the end).
        setList(all.filter((m) => parseISO(m.end).getTime() + 30 * 60_000 > now).slice(0, SHOWN))
      })
      .catch(() => setList([]))
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("team.upcomingMeetings")}</CardTitle>
        <CardDescription>{t("team.upcomingQrHint")}</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {list?.length === 0 && <p className="py-2 text-sm text-muted-foreground">{t("team.noUpcoming")}</p>}
        {list?.map((m) => (
          <div key={m.id} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{m.title}</span>
              <span className="text-xs text-muted-foreground">
                {format(parseISO(m.start), "EEE d MMM, HH:mm", { locale })}
                {m.can_check_in && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">● {t("checkin.now")}</span>}
              </span>
            </span>
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
        ))}
      </CardContent>
      <MeetingQrDialog meeting={qr} onClose={() => setQr(null)} />
    </Card>
  )
}
