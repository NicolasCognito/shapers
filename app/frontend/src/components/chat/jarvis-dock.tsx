import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { format, isToday, parseISO } from "date-fns"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowExpand01Icon,
  ArrowLeft01Icon,
  Cancel01Icon,
  Clock01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ActiveChat } from "@/components/chat/chat-area"
import { useDateLocale } from "@/i18n"
import { extractErrorMessage } from "@/lib/error"
import { pb } from "@/lib/pocketbase"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import { useLlmSettingsStore } from "@/store/llm-settings"
import type { Conversation } from "@/types/chat"
import { cn } from "@/lib/utils"

// Session rules for the floating panel:
// - its chats are separate from /chat (source = "dock"),
// - while the panel stays open (page changes, reloads) it keeps one chat,
// - closing it ends the session: the next open starts a fresh chat,
//   and a chat with no messages is deleted on close,
// - earlier panel chats are in its History.
const SESSION_KEY = "shapers.jarvisDock" // sessionStorage: { open, id }
const NEW_TITLE = "New conversation"

type Session = { open: boolean; id: string | null }

function readSession(): Session {
  try {
    const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null")
    if (v && typeof v.open === "boolean") return { open: v.open, id: v.id ?? null }
  } catch {
    /* ignore */
  }
  return { open: false, id: null }
}

function saveSession(s: Session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

const col = () => pb.collection("chat_conversations")

export function JarvisDock() {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const initModels = useLlmSettingsStore((s) => s.initialize)
  const [session, setSession] = useState<Session>(readSession)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [history, setHistory] = useState<Conversation[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const update = (s: Session) => {
    setSession(s)
    saveSession(s)
  }

  const startNew = useCallback(async () => {
    try {
      const c = await col().create<Conversation>({ title: NEW_TITLE, source: "dock" })
      setConversation(c)
      setShowHistory(false)
      update({ open: true, id: c.id })
    } catch (e) {
      toast.error(extractErrorMessage(e, t("dock.createFailed")))
    }
  }, [t])

  // Open: resume this session's chat, or start a new one.
  useEffect(() => {
    if (!session.open) return
    void initModels()
    if (conversation?.id === session.id && conversation) return
    if (session.id) {
      col()
        .getOne<Conversation>(session.id, { requestKey: null })
        .then(setConversation)
        .catch(() => void startNew())
    } else {
      void startNew()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.open])

  const close = async () => {
    const c = conversation
    update({ open: false, id: null })
    setConversation(null)
    setShowHistory(false)
    if (!c) return
    // Don't leave empty chats behind.
    const n = await pb
      .collection("chat_messages")
      .getList(1, 1, { filter: pb.filter("conversation = {:c}", { c: c.id }), requestKey: null })
      .then((r) => r.totalItems)
      .catch(() => 1)
    if (n === 0) await col().delete(c.id).catch(() => {})
  }

  const openHistory = async () => {
    setShowHistory(true)
    setHistory(null)
    const list = await col()
      .getList<Conversation>(1, 30, {
        filter: "source = 'dock' && status = 'active'",
        sort: "-last_message_at,-updated",
        requestKey: null,
      })
      .catch(() => null)
    setHistory((list?.items ?? []).filter((c) => c.title !== NEW_TITLE || c.id === conversation?.id))
  }

  const pick = (c: Conversation) => {
    setConversation(c)
    setShowHistory(false)
    update({ open: true, id: c.id })
  }

  if (!session.open) {
    return (
      <button
        type="button"
        onClick={() => update({ open: true, id: null })}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-primary py-3 pr-5 pl-4 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105 md:right-6 md:bottom-6"
        aria-label={t("dock.open")}
      >
        <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-5" />
        {t("dock.ask")}
      </button>
    )
  }

  const started = conversation ? parseISO(conversation.created.replace(" ", "T")) : null
  const title =
    conversation && conversation.title !== NEW_TITLE
      ? conversation.title
      : started
        ? t("dock.newAt", { time: format(started, "HH:mm") })
        : ""
  const when = (c: Conversation) => {
    const d = parseISO((c.last_message_at || c.updated).replace(" ", "T"))
    return isToday(d) ? format(d, "HH:mm") : format(d, "d MMM", { locale })
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 flex flex-col bg-background",
        "md:inset-auto md:right-6 md:bottom-6 md:h-[min(680px,calc(100vh-6rem))] md:w-[420px] md:rounded-2xl md:border md:shadow-2xl"
      )}
      role="dialog"
      aria-label="Jarvis"
    >
      <div className="flex items-center gap-1 border-b px-3 py-2">
        {showHistory ? (
          <Button variant="ghost" size="icon-sm" onClick={() => setShowHistory(false)} aria-label={t("dock.back")}>
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
        ) : (
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="mx-1 size-4 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-semibold">{showHistory ? t("dock.history") : "Jarvis"}</p>
          {!showHistory && title && <p className="truncate text-xs text-muted-foreground">{title}</p>}
        </div>
        {!showHistory && (
          <Button variant="ghost" size="icon-sm" onClick={() => void openHistory()} aria-label={t("dock.history")} title={t("dock.history")}>
            <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={() => void startNew()} aria-label={t("dock.new")} title={t("dock.new")}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        </Button>
        {conversation && (
          <Button variant="ghost" size="icon-sm" asChild aria-label={t("dock.full")} title={t("dock.full")}>
            <Link to={workspaceRecordUrl("chat", conversation.id)} onClick={() => update({ open: false, id: null })}>
              <HugeiconsIcon icon={ArrowExpand01Icon} strokeWidth={2} />
            </Link>
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={() => void close()} aria-label={t("dock.close")} title={t("dock.close")}>
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>

      {showHistory ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {!history ? (
            <Skeleton className="h-24" />
          ) : history.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">{t("dock.noHistory")}</p>
          ) : (
            history.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted",
                  c.id === conversation?.id && "bg-muted"
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {c.title === NEW_TITLE ? t("dock.untitled") : c.title}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{when(c)}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="@container flex min-h-0 flex-1 flex-col overflow-hidden">
          {conversation ? (
            <ActiveChat
              key={conversation.id}
              conversation={conversation}
              embedded
              onRenamed={(title) => setConversation((c) => (c ? { ...c, title } : c))}
            />
          ) : (
            <div className="p-4">
              <Skeleton className="h-24" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
