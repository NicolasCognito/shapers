import { useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
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
  const [meeting, setMeeting] = useState<{ title: string; start_at: string; members: string[] } | null>(null)
  const [states, setStates] = useState<Record<string, AttendanceState | "">>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!meetingId) return
    setMeeting(null)
    Promise.all([teamApi.meeting(meetingId), teamApi.meetingAttendance(meetingId)]).then(
      ([m, att]) => {
        setMeeting(m)
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
      toast.success(t("rollCall.saved", { count: r.saved }))
      onSaved()
      onClose()
    } catch (e) {
      toast.error(extractErrorMessage(e, t("common.couldNotSave")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!meetingId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{meeting?.title ?? t("rollCall.title")}</SheetTitle>
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
            <div key={p.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <div className="flex gap-1">
                {STATES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStates((s) => ({ ...s, [p.id]: s[p.id] === st ? "" : st }))}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition",
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
    </Sheet>
  )
}
