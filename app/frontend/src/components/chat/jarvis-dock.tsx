import { useEffect, useState } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, ArrowExpand01Icon, SparklesIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { ChatArea } from "@/components/chat/chat-area"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import { useChatStore } from "@/store/chat"
import { useLlmSettingsStore } from "@/store/llm-settings"
import { cn } from "@/lib/utils"

const OPEN_KEY = "shapers.jarvisDock"

function readOpen() {
  try {
    return sessionStorage.getItem(OPEN_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Jarvis on every page: a floating button that opens a chat panel. It shares
 * the active conversation with /chat, and stays open while Jarvis moves the
 * user around the app (ui_navigate), so the page changes behind it.
 */
export function JarvisDock() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(readOpen)
  const activeId = useChatStore((s) => s.activeConversationId)
  const initChat = useChatStore((s) => s.initialize)
  const initModels = useLlmSettingsStore((s) => s.initialize)

  useEffect(() => {
    try {
      sessionStorage.setItem(OPEN_KEY, open ? "1" : "0")
    } catch {
      /* ignore */
    }
    if (open) void Promise.all([initChat(), initModels()])
  }, [open, initChat, initModels])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-primary py-3 pr-5 pl-4 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105 md:right-6 md:bottom-6"
        aria-label={t("dock.open")}
      >
        <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-5" />
        {t("dock.ask")}
      </button>
    )
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
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-4 text-primary" />
        <span className="flex-1 text-sm font-semibold">Jarvis</span>
        <Button variant="ghost" size="icon-sm" asChild aria-label={t("dock.full")} title={t("dock.full")}>
          <Link to={activeId ? workspaceRecordUrl("chat", activeId) : "/chat"} onClick={() => setOpen(false)}>
            <HugeiconsIcon icon={ArrowExpand01Icon} strokeWidth={2} />
          </Link>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label={t("dock.close")}>
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>
      <div className="@container flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatArea />
      </div>
    </div>
  )
}
