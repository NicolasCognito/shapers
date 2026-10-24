import { useCallback, useEffect, useState } from "react"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

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
import { useDateLocale } from "@/i18n"
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

function useDescribe() {
  const { t } = useTranslation()
  const locale = useDateLocale()
  return (r: RequestRec) => {
    if (r.type === "hours") {
      const date = r.date
        ? format(parseISO(r.date.replace(" ", "T")), "d MMM", { locale })
        : ""
      return t("requests.hoursOn", { hours: fmtHours(r.hours), date })
    }
    return t("requests.takeOver", {
      title: r.expand?.task?.title ?? t("requests.taskFallback"),
    })
  }
}

export function RequestsPage() {
  const { t } = useTranslation()
  const me = pb.authStore.record?.id ?? ""
  const isAdmin = can("hours.manage")
  const [items, setItems] = useState<RequestRec[] | null>(null)

  const load = useCallback(() => {
    requestsApi
      .list()
      .then(setItems)
      .catch((e) =>
        toast.error(extractErrorMessage(e, t("requests.loadFailed")))
      )
  }, [])
  useEffect(load, [load])

  const run = async (p: Promise<unknown>, msg: string) => {
    try {
      await p
      toast.success(msg)
      load()
    } catch (e) {
      toast.error(extractErrorMessage(e, t("common.somethingWrong")))
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
        <h1 className="text-2xl font-semibold">{t("requests.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("requests.subtitle")}
        </p>
      </div>

      {!items ? (
        <Skeleton className="h-48" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {t("requests.waitingForYou", { count: inbox.length })}
              </CardTitle>
              <CardDescription>
                {isAdmin
                  ? t("requests.waitingAdmin")
                  : t("requests.waitingMember")}
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {inbox.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("requests.nothingToDecide")}
                </p>
              )}
              {inbox.map((r) => (
                <InboxRow
                  key={r.id}
                  r={r}
                  onDecide={(approve, note) =>
                    run(
                      requestsApi.decide(r.id, approve, note),
                      approve ? t("requests.approved") : t("requests.rejected")
                    )
                  }
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("requests.myRequests")}</CardTitle>
              <CardDescription>
                {t("requests.myRequestsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {mine.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("requests.noRequests")}
                </p>
              )}
              {mine.map((r) => (
                <Row
                  key={r.id}
                  r={r}
                  who={
                    r.type === "handoff"
                      ? t("requests.toPerson", {
                          name: r.expand?.recipient?.name,
                        })
                      : t("requests.toAdmins")
                  }
                >
                  {r.status === "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        run(
                          requestsApi.withdraw(r.id),
                          t("requests.withdrawn")
                        )
                      }
                    >
                      {t("requests.withdraw")}
                    </Button>
                  )}
                </Row>
              ))}
            </CardContent>
          </Card>

          {isAdmin && decided.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("requests.decided")}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {decided.map((r) => (
                  <Row
                    key={r.id}
                    r={r}
                    who={t("requests.fromPerson", {
                      name: r.expand?.requester?.name,
                    })}
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
  const { t } = useTranslation()
  const describe = useDescribe()
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {describe(r)}{" "}
          <span className="font-normal text-muted-foreground">· {who}</span>
        </p>
        {r.note && <p className="text-muted-foreground">{r.note}</p>}
        {r.decision_note && <p className="mt-0.5">
            {t("requests.answer", { note: r.decision_note })}
          </p>}
      </div>
      <span
        className={cn("rounded-md px-2 py-0.5 text-xs", STATUS_CLASS[r.status])}
      >
        {t(`requests.status.${r.status}`)}
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
  const { t } = useTranslation()
  const describe = useDescribe()
  const [note, setNote] = useState("")
  const needsReason = r.type === "hours"
  return (
    <div className="space-y-2 py-3 text-sm">
      <div>
        <p className="font-medium">
          {describe(r)}{" "}
          <span className="font-normal text-muted-foreground">
            ·{" "}
            {t("requests.fromPerson", { name: r.expand?.requester?.name })}
          </span>
        </p>
        {r.note && <p className="text-muted-foreground">{r.note}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-48 flex-1"
          placeholder={
            needsReason
              ? t("requests.reasonPlaceholder")
              : t("requests.commentPlaceholder")
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" onClick={() => onDecide(true, note)}>
          {r.type === "handoff" ? t("requests.accept") : t("requests.approve")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={needsReason && !note.trim()}
          onClick={() => onDecide(false, note)}
        >
          {r.type === "handoff" ? t("requests.decline") : t("requests.reject")}
        </Button>
      </div>
    </div>
  )
}
