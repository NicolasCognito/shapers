import { useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { notify } from "@/lib/notify"
import { useTranslation } from "react-i18next"

import { HugeiconsIcon } from "@hugeicons/react"
import { QrCodeIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { MeetingQrDialog } from "@/components/team/meeting-qr"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useDateLocale } from "@/i18n"
import { extractErrorMessage } from "@/lib/error"
import { cn } from "@/lib/utils"
import { STATE_CLASS, teamApi, type AttendanceState } from "@/lib/team"

const STATES: AttendanceState[] = ["present", "remote", "excused", "unexcused"]

type Person = { id: string; name: string; tier: string }

/** Admin roll-call: everyone in the meeting, one tap per person. */
export function RollCallSheet({
  meetingId,
  people,
  onClose,
  onSaved,
}: {
  meetingId: string | null
  people: Person[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  type MeetingInfo = { title: string; start_at: string; members: string[] }
  // Kept with its id, so another meeting never shows stale data while loading.
  const [loaded, setLoaded] = useState<{ id: string; meeting: MeetingInfo } | null>(null)
  const meeting = loaded && loaded.id === meetingId ? loaded.meeting : null
  const [states, setStates] = useState<Record<string, AttendanceState | "">>({})
  const [busy, setBusy] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  useEffect(() => {
    if (!meetingId) return
    Promise.all([teamApi.meeting(meetingId), teamApi.meetingAttendance(meetingId)]).then(
      ([m, att]) => {
        setLoaded({ id: meetingId, meeting: m })
        const s: Record<string, AttendanceState | ""> = {}
        for (const id of m.members) s[id] = ""
        for (const a of att) s[a.user] = a.state
        setStates(s)
      }
    )
  }, [meetingId])

  const members = useMemo(
    () => people.filter((p) => meeting?.members.includes(p.id)),
    [people, meeting]
  )
  const unmarked = members.filter((p) => !states[p.id]).length

  const save = async () => {
    if (!meetingId) return
    setBusy(true)
    try {
      const entries = Object.entries(states)
        .filter(([, st]) => st)
        .map(([user, state]) => ({ user, state: state as AttendanceState }))
      const r = await teamApi.bulkAttendance(meetingId, entries)
      notify.success(t("rollCall.saved", { count: r.saved }))
      onSaved()
      onClose()
    } catch (e) {
      notify.error(extractErrorMessage(e, t("common.couldNotSave")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!meetingId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-start justify-between gap-2 pr-8">
            <SheetTitle>{meeting?.title ?? t("rollCall.title")}</SheetTitle>
            {meeting && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0"
                onClick={() => setQrOpen(true)}
                aria-label={t("checkin.showQr")}
                title={t("checkin.showQr")}
              >
                <HugeiconsIcon icon={QrCodeIcon} strokeWidth={2} />
                QR
              </Button>
            )}
          </div>
          <SheetDescription>
            {meeting &&
              format(parseISO(meeting.start_at), "EEEE d MMM, HH:mm", {
                locale,
              })}{" "}
            · {t("rollCall.membersCount", { count: members.length })}
            {unmarked > 0 &&
              ` · ${t("rollCall.notMarked", { count: unmarked })}`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex gap-2 px-4">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setStates((s) => {
                const n = { ...s }
                for (const p of members) if (!n[p.id]) n[p.id] = "present"
                return n
              })
            }
          >
            {t("rollCall.markRestPresent")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setStates((s) => {
                const n = { ...s }
                for (const p of members) if (!n[p.id]) n[p.id] = "unexcused"
                return n
              })
            }
          >
            {t("rollCall.restMissed")}
          </Button>
        </div>
        <div className="flex-1 divide-y overflow-y-auto px-4">
          {members.map((p) => (
            <div key={p.id} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:gap-2">
              <span className="text-sm font-medium sm:min-w-0 sm:flex-1 sm:truncate sm:font-normal">{p.name}</span>
              <div className="grid grid-cols-4 gap-1 sm:flex">
                {STATES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStates((s) => ({ ...s, [p.id]: s[p.id] === st ? "" : st }))}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-xs font-medium transition sm:py-1",
                      states[p.id] === st
                        ? STATE_CLASS[st] + " ring-1 ring-current"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {t(`common.state.${st}`)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <SheetFooter>
          <Button onClick={save} disabled={busy || !meeting}>
            {t("rollCall.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
      <MeetingQrDialog
        meeting={qrOpen && meetingId && meeting ? { id: meetingId, title: meeting.title } : null}
        onClose={() => setQrOpen(false)}
      />
    </Sheet>
  )
}
