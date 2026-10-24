import { useCallback, useEffect, useState } from "react"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { extractErrorMessage } from "@/lib/error"
import { can } from "@/lib/permissions"
import { pb } from "@/lib/pocketbase"
import { fmtHours, requestsApi, type RequestRec } from "@/lib/team"
import { cn } from "@/lib/utils"

const STATUS_CLASS: Record<RequestRec["status"], string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  withdrawn: "bg-muted text-muted-foreground",
}

const day = (d: string) =>
  d ? format(parseISO(d.replace(" ", "T")), "d MMM") : ""

function describe(r: RequestRec) {
  if (r.type === "hours") return `${fmtHours(r.hours)} on ${day(r.date)}`
  return `Take over “${r.expand?.task?.title ?? "task"}”`
}

export function RequestsPage() {
  const me = pb.authStore.record?.id ?? ""
  const isAdmin = can("hours.manage")
  const [items, setItems] = useState<RequestRec[] | null>(null)

  const load = useCallback(() => {
    requestsApi
      .list()
      .then(setItems)
      .catch((e) =>
        toast.error(extractErrorMessage(e, "Could not load requests"))
      )
  }, [])
  useEffect(load, [load])

  const run = async (p: Promise<unknown>, msg: string) => {
    try {
      await p
      toast.success(msg)
      load()
    } catch (e) {
      toast.error(extractErrorMessage(e, "Something went wrong"))
    }
  }

  const all = items ?? []
  const inbox = all.filter(
    (r) =>
      r.status === "pending" &&
      r.requester !== me &&
      (r.recipient === me || (r.type === "hours" && isAdmin))
  )
  const mine = all.filter((r) => r.requester === me)
  const decided = isAdmin
    ? all
        .filter(
          (r) =>
            r.type === "hours" && r.status !== "pending" && r.requester !== me
        )
        .slice(0, 20)
    : []

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Requests</h1>
        <p className="text-sm text-muted-foreground">
          Hours for older dates and task handoffs. Every answer comes with a
          reason you can see.
        </p>
      </div>

      {!items ? (
        <Skeleton className="h-48" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Waiting for you · {inbox.length}</CardTitle>
              <CardDescription>
                {isAdmin
                  ? "Hour requests from members and tasks offered to you"
                  : "Tasks offered to you"}
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {inbox.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing to decide.
                </p>
              )}
              {inbox.map((r) => (
                <InboxRow
                  key={r.id}
                  r={r}
                  onDecide={(approve, note) =>
                    run(
                      requestsApi.decide(r.id, approve, note),
                      approve ? "Approved" : "Rejected"
                    )
                  }
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My requests</CardTitle>
              <CardDescription>
                To ask for older hours, pick the date in “Log hours” on My week
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {mine.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No requests yet.
                </p>
              )}
              {mine.map((r) => (
                <Row
                  key={r.id}
                  r={r}
                  who={
                    r.type === "handoff"
                      ? `to ${r.expand?.recipient?.name}`
                      : "to admins"
                  }
                >
                  {r.status === "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        run(requestsApi.withdraw(r.id), "Withdrawn")
                      }
                    >
                      Withdraw
                    </Button>
                  )}
                </Row>
              ))}
            </CardContent>
          </Card>

          {isAdmin && decided.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Decided hour requests</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {decided.map((r) => (
                  <Row
                    key={r.id}
                    r={r}
                    who={`from ${r.expand?.requester?.name}`}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Row({
  r,
  who,
  children,
}: {
  r: RequestRec
  who: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {describe(r)}{" "}
          <span className="font-normal text-muted-foreground">· {who}</span>
        </p>
        {r.note && <p className="text-muted-foreground">{r.note}</p>}
        {r.decision_note && <p className="mt-0.5">Answer: {r.decision_note}</p>}
      </div>
      <span
        className={cn("rounded-md px-2 py-0.5 text-xs", STATUS_CLASS[r.status])}
      >
        {r.status}
      </span>
      {children}
    </div>
  )
}

function InboxRow({
  r,
  onDecide,
}: {
  r: RequestRec
  onDecide: (approve: boolean, note: string) => void
}) {
  const [note, setNote] = useState("")
  const needsReason = r.type === "hours"
  return (
    <div className="space-y-2 py-3 text-sm">
      <div>
        <p className="font-medium">
          {describe(r)}{" "}
          <span className="font-normal text-muted-foreground">
            · from {r.expand?.requester?.name}
          </span>
        </p>
        {r.note && <p className="text-muted-foreground">{r.note}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-48 flex-1"
          placeholder={
            needsReason ? "Reason (required to reject)" : "Comment (optional)"
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" onClick={() => onDecide(true, note)}>
          {r.type === "handoff" ? "Accept" : "Approve"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={needsReason && !note.trim()}
          onClick={() => onDecide(false, note)}
        >
          {r.type === "handoff" ? "Decline" : "Reject"}
        </Button>
      </div>
    </div>
  )
}
