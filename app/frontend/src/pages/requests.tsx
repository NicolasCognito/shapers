import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { addDays, format, formatDistanceToNow, parseISO } from "date-fns"
import { notify } from "@/lib/notify"
import { useTranslation } from "react-i18next"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowDataTransferHorizontalIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  PauseIcon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { LogDatePicker } from "@/components/team/log-date-picker"
import { useDateLocale } from "@/i18n"
import { extractErrorMessage } from "@/lib/error"
import { can } from "@/lib/permissions"
import { pb } from "@/lib/pocketbase"
import { fmtHours, requestsApi, selfLogAllowed, type RequestRec } from "@/lib/team"
import { cn } from "@/lib/utils"

// One entry per request type: how it looks and how it is decided. A new
// type only needs a line here (and its i18n strings); unknown types still
// render with the fallback.
type TypeMeta = {
  icon: IconSvgElement
  tone: string
  /** Rejecting needs a written reason (admin decisions do). */
  reasonToReject: boolean
  /** Admins may approve all pending ones of this type at once. */
  bulk: boolean
  /** Decided by admins (shown in History) rather than by one person. */
  admin: boolean
}

const TYPES: Record<string, TypeMeta> = {
  hours: {
    icon: Clock01Icon,
    tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    reasonToReject: true,
    bulk: true,
    admin: true,
  },
  pause: {
    icon: PauseIcon,
    tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    reasonToReject: true,
    bulk: false,
    admin: true,
  },
  handoff: {
    icon: ArrowDataTransferHorizontalIcon,
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    reasonToReject: false,
    bulk: false,
    admin: false,
  },
}
const FALLBACK: TypeMeta = {
  icon: Clock01Icon,
  tone: "bg-muted text-muted-foreground",
  reasonToReject: true,
  bulk: false,
  admin: true,
}
const meta = (type: string) => TYPES[type] ?? FALLBACK

const STATUS_CLASS: Record<RequestRec["status"], string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  withdrawn: "bg-muted text-muted-foreground",
}

const PAGE = 20

function useDescribe() {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const d = (s?: string) => (s ? format(parseISO(s.replace(" ", "T")), "d MMM", { locale }) : "")
  return (r: RequestRec) => {
    if (r.type === "hours") return t("requests.hoursOn", { hours: fmtHours(r.hours), date: d(r.date) })
    if (r.type === "pause") return t("requests.pauseFromTo", { from: d(r.date), to: d(r.end_date) })
    if (r.type === "handoff")
      return t("requests.takeOver", { title: r.expand?.task?.title ?? t("requests.taskFallback") })
    return t(`requests.type.${r.type}`, { defaultValue: r.type })
  }
}

/** Server-paged list of decided requests ("Show more" loads the next page). */
function usePaged(filter: string, enabled: boolean) {
  const [items, setItems] = useState<RequestRec[] | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const load = useCallback(
    (p: number) => {
      if (!enabled) return
      requestsApi
        .page(filter, p, PAGE)
        .then((res) => {
          setItems((cur) => (p === 1 ? res.items : [...(cur ?? []), ...res.items]))
          setTotal(res.totalItems)
          setPage(p)
        })
        .catch(() => setItems((cur) => cur ?? []))
    },
    [filter, enabled]
  )
  useEffect(() => load(1), [load])
  return { items, total, more: () => load(page + 1), reload: () => load(1) }
}

export function RequestsPage() {
  const { t } = useTranslation()
  const me = pb.authStore.record?.id ?? ""
  const isAdmin = can("hours.manage")
  const [pending, setPending] = useState<RequestRec[] | null>(null)
  const [tab, setTab] = useState<string | null>(null)
  const [dialog, setDialog] = useState<"hours" | "pause" | null>(null)

  // History filters (admin).
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [q, setQ] = useState("")
  useEffect(() => {
    const id = setTimeout(() => setQ(query.trim()), 300)
    return () => clearTimeout(id)
  }, [query])

  const loadPending = useCallback(() => {
    requestsApi
      .pending()
      .then(setPending)
      .catch((e) => notify.error(extractErrorMessage(e, t("requests.loadFailed"))))
  }, [t])
  useEffect(loadPending, [loadPending])

  const mineDone = usePaged(pb.filter("requester = {:me} && status != 'pending'", { me }), true)
  const adminTypes = Object.keys(TYPES).filter((k) => TYPES[k].admin)
  const historyFilter = useMemo(() => {
    const parts = [pb.filter("status != 'pending' && requester != {:me}", { me })]
    parts.push(
      typeFilter === "all"
        ? "(" + adminTypes.map((k) => pb.filter("type = {:k}", { k })).join(" || ") + ")"
        : pb.filter("type = {:k}", { k: typeFilter })
    )
    if (q) parts.push(pb.filter("requester.name ~ {:q}", { q }))
    return parts.join(" && ")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, typeFilter, q])
  const history = usePaged(historyFilter, isAdmin)

  const refresh = () => {
    loadPending()
    mineDone.reload()
    if (isAdmin) history.reload()
  }

  const run = async (p: Promise<unknown>, msg: string) => {
    try {
      await p
      notify.success(msg)
      refresh()
    } catch (e) {
      notify.error(extractErrorMessage(e, t("common.somethingWrong")))
    }
  }

  const all = pending ?? []
  const inbox = all.filter(
    (r) => r.requester !== me && (r.recipient === me || (meta(r.type).admin && isAdmin))
  )
  const minePending = all.filter((r) => r.requester === me)
  const current = tab ?? (inbox.length > 0 ? "inbox" : "mine")

  // Bulk approve per type, e.g. "Approve all 5 hour requests".
  const bulkGroups = isAdmin
    ? Object.entries(TYPES)
        .filter(([, m]) => m.bulk)
        .map(([type]) => ({ type, items: inbox.filter((r) => r.type === type) }))
        .filter((g) => g.items.length >= 2)
    : []
  const approveAll = async (type: string, items: RequestRec[]) => {
    if (!window.confirm(t("requests.approveAllConfirm", { count: items.length, type: t(`requests.type.${type}`) })))
      return
    const res = await Promise.allSettled(items.map((r) => requestsApi.decide(r.id, true, "")))
    const failed = res.filter((x) => x.status === "rejected").length
    if (failed) notify.error(t("requests.someFailed", { count: failed }))
    else notify.success(t("requests.approvedMany", { count: items.length }))
    refresh()
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{t("requests.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("requests.subtitle")}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              {t("requests.new")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={() => setDialog("hours")}>
              <TypeIcon type="hours" small />
              {t("requests.newHours")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog("pause")}>
              <TypeIcon type="pause" small />
              {t("requests.newPause")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/tasks">
                <TypeIcon type="handoff" small />
                <span className="text-muted-foreground">{t("requests.newHandoff")}</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!pending ? (
        <Skeleton className="h-48" />
      ) : (
        <Tabs value={current} onValueChange={setTab}>
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="inbox" className="gap-1.5">
              {t("requests.tabInbox")}
              <Count n={inbox.length} hot />
            </TabsTrigger>
            <TabsTrigger value="mine" className="gap-1.5">
              {t("requests.tabMine")}
              <Count n={minePending.length} />
            </TabsTrigger>
            {isAdmin && <TabsTrigger value="history">{t("requests.tabHistory")}</TabsTrigger>}
          </TabsList>

          <TabsContent value="inbox" className="mt-4 space-y-3">
            {bulkGroups.map((g) => (
              <div
                key={g.type}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed px-4 py-2.5 text-sm"
              >
                <span className="text-muted-foreground">
                  {t("requests.bulkHint", { count: g.items.length, type: t(`requests.type.${g.type}`) })}
                </span>
                <Button size="sm" variant="secondary" onClick={() => void approveAll(g.type, g.items)}>
                  <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
                  {t("requests.approveAll", { count: g.items.length })}
                </Button>
              </div>
            ))}
            {inbox.length === 0 ? (
              <Empty title={t("requests.allClear")} hint={isAdmin ? t("requests.waitingAdmin") : t("requests.waitingMember")} />
            ) : (
              inbox.map((r) => (
                <InboxCard
                  key={r.id}
                  r={r}
                  onDecide={(approve, note) =>
                    run(requestsApi.decide(r.id, approve, note), approve ? t("requests.approved") : t("requests.rejected"))
                  }
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="mine" className="mt-4 space-y-3">
            {minePending.length === 0 && mineDone.items?.length === 0 ? (
              <Empty title={t("requests.noRequests")} hint={t("requests.myRequestsDesc")} />
            ) : (
              <>
                {minePending.map((r) => (
                  <RequestCard key={r.id} r={r} person={recipientLabel(r, t)}>
                    <Button size="sm" variant="ghost" onClick={() => run(requestsApi.withdraw(r.id), t("requests.withdrawn"))}>
                      {t("requests.withdraw")}
                    </Button>
                  </RequestCard>
                ))}
                {(mineDone.items ?? []).map((r) => (
                  <RequestCard key={r.id} r={r} person={recipientLabel(r, t)} muted />
                ))}
                <More shown={mineDone.items?.length ?? 0} total={mineDone.total} onMore={mineDone.more} />
              </>
            )}
          </TabsContent>

          {isAdmin && (
            <TabsContent value="history" className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {["all", ...adminTypes].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTypeFilter(k)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        typeFilter === k ? "border-transparent bg-foreground text-background" : "hover:bg-muted"
                      )}
                    >
                      {k === "all" ? t("requests.filterAll") : t(`requests.type.${k}`)}
                    </button>
                  ))}
                </div>
                <div className="relative ml-auto w-full sm:w-56">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    strokeWidth={2}
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("requests.searchPerson")}
                    className="h-8 pl-8"
                  />
                </div>
              </div>
              {!history.items ? (
                <Skeleton className="h-32" />
              ) : history.items.length === 0 ? (
                <Empty title={t("requests.noHistory")} />
              ) : (
                <>
                  {history.items.map((r) => (
                    <RequestCard
                      key={r.id}
                      r={r}
                      person={r.expand?.requester?.name ?? ""}
                      avatar={r.expand?.requester?.name}
                      muted
                    />
                  ))}
                  <More shown={history.items.length} total={history.total} onMore={history.more} />
                </>
              )}
            </TabsContent>
          )}
        </Tabs>
      )}

      <HoursDialog open={dialog === "hours"} onClose={() => setDialog(null)} onSent={refresh} />
      <PauseDialog open={dialog === "pause"} onClose={() => setDialog(null)} onSent={refresh} />
    </div>
  )
}

function recipientLabel(r: RequestRec, t: (k: string, o?: Record<string, unknown>) => string) {
  return r.type === "handoff" ? t("requests.toPerson", { name: r.expand?.recipient?.name }) : t("requests.toAdmins")
}

function Count({ n, hot }: { n: number; hot?: boolean }) {
  if (!n) return null
  return (
    <span
      className={cn(
        "min-w-5 rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums",
        hot ? "bg-rose-500 text-white" : "bg-muted-foreground/15"
      )}
    >
      {n}
    </span>
  )
}

function TypeIcon({ type, small }: { type: string; small?: boolean }) {
  const m = meta(type)
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full", m.tone, small ? "size-6" : "size-10")}>
      <HugeiconsIcon icon={m.icon} strokeWidth={2} className={small ? "size-3.5" : "size-5"} />
    </span>
  )
}

function Initials({ name }: { name?: string }) {
  const s = (name ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
      {s}
    </span>
  )
}

function When({ iso }: { iso: string }) {
  const locale = useDateLocale()
  const d = parseISO(iso.replace(" ", "T"))
  return (
    <span title={format(d, "d MMM yyyy, HH:mm", { locale })}>
      {formatDistanceToNow(d, { addSuffix: true, locale })}
    </span>
  )
}

function RequestCard({
  r,
  person,
  avatar,
  muted,
  children,
}: {
  r: RequestRec
  person: string
  avatar?: string
  muted?: boolean
  children?: React.ReactNode
}) {
  const { t } = useTranslation()
  const describe = useDescribe()
  return (
    <div className={cn("flex gap-3 rounded-xl border bg-card p-3 text-sm", muted && "bg-transparent")}>
      <TypeIcon type={r.type} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-medium">{describe(r)}</p>
          <span className={cn("rounded-md px-2 py-0.5 text-xs", STATUS_CLASS[r.status])}>
            {t(`requests.status.${r.status}`)}
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {avatar && <Initials name={avatar} />}
          {person}
          <span aria-hidden>·</span>
          <When iso={r.created} />
        </p>
        {r.note && <p className="border-l-2 pl-2 text-muted-foreground">{r.note}</p>}
        {r.decision_note && <p>{t("requests.answer", { note: r.decision_note })}</p>}
      </div>
      {children && <div className="shrink-0 self-start">{children}</div>}
    </div>
  )
}

function InboxCard({ r, onDecide }: { r: RequestRec; onDecide: (approve: boolean, note: string) => void }) {
  const { t } = useTranslation()
  const describe = useDescribe()
  const m = meta(r.type)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState("")
  const handoff = r.type === "handoff"
  const name = r.expand?.requester?.name

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 text-sm shadow-xs">
      <div className="flex gap-3">
        <TypeIcon type={r.type} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-base font-medium">{describe(r)}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Initials name={name} />
            {name}
            <span aria-hidden>·</span>
            <When iso={r.created} />
          </p>
          {r.note && <p className="border-l-2 pl-2 text-muted-foreground">{r.note}</p>}
        </div>
      </div>

      {rejecting ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={m.reasonToReject ? t("requests.reasonPlaceholder") : t("requests.commentPlaceholder")}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={m.reasonToReject && !note.trim()}
              onClick={() => onDecide(false, note.trim())}
            >
              {handoff ? t("requests.decline") : t("requests.reject")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button className="flex-1 sm:flex-none" onClick={() => onDecide(true, "")}>
            <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
            {handoff ? t("requests.accept") : t("requests.approve")}
          </Button>
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => (m.reasonToReject ? setRejecting(true) : onDecide(false, ""))}
          >
            {handoff ? t("requests.decline") : t("requests.reject")}…
          </Button>
        </div>
      )}
    </div>
  )
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.5} className="size-10 text-emerald-500" />
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}

function More({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  const { t } = useTranslation()
  if (shown >= total) return null
  return (
    <Button variant="ghost" className="w-full" onClick={onMore}>
      {t("requests.showMore", { count: total - shown })}
    </Button>
  )
}

function HoursDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const { t } = useTranslation()
  const [date, setDate] = useState(format(addDays(new Date(), -2), "yyyy-MM-dd"))
  const [hours, setHours] = useState<number | "">("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const recent = selfLogAllowed(date)

  const send = async () => {
    setBusy(true)
    try {
      await requestsApi.hours(date, Number(hours), note.trim())
      notify.success(t("requests.sent"))
      setHours("")
      setNote("")
      onSent()
      onClose()
    } catch (e) {
      notify.error(extractErrorMessage(e, t("common.somethingWrong")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("requests.newHours")}</DialogTitle>
          <DialogDescription>{t("requests.hoursDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <LogDatePicker className="w-40" value={date} onChange={setDate} />
          <Input
            type="number"
            step="0.25"
            min="0.25"
            className="w-28"
            placeholder={t("memberDetail.hoursPlaceholder")}
            value={hours}
            onChange={(e) => setHours(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("requests.whatDidYouDo")} />
        {recent && (
          <p className="text-xs text-muted-foreground">
            {t("requests.recentHint")}{" "}
            <Link to="/me" className="underline" onClick={onClose}>
              {t("requests.openMyWeek")}
            </Link>
          </p>
        )}
        <DialogFooter>
          <Button disabled={busy || recent || !hours || Number(hours) <= 0 || !note.trim()} onClick={() => void send()}>
            {t("memberDetail.sendRequest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PauseDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const { t } = useTranslation()
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd")
  const [from, setFrom] = useState(tomorrow)
  const [to, setTo] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd"))
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    try {
      await requestsApi.pause(from, to, note.trim())
      notify.success(t("rules.pauseRequested"))
      setNote("")
      onSent()
      onClose()
    } catch (e) {
      notify.error(extractErrorMessage(e, t("common.somethingWrong")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("requests.newPause")}</DialogTitle>
          <DialogDescription>{t("requests.pauseDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            {t("requests.from")}
            <DatePicker value={from} onChange={setFrom} />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            {t("requests.to")}
            <DatePicker value={to} onChange={setTo} />
          </label>
        </div>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("requests.pauseReason")} />
        <DialogFooter>
          <Button disabled={busy || !from || !to || to < from || !note.trim()} onClick={() => void send()}>
            {t("memberDetail.sendRequest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
