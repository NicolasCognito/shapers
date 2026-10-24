import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Menu01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { useChatStore } from "@/store/chat"
import { ConversationList } from "./conversation-list"
import { ChatArea } from "./chat-area"

// Desktop: list and chat side by side. Phone: one at a time — the chat by
// default, the list behind a "Conversations" button; picking one returns.
export function ChatLayout() {
  const { t } = useTranslation()
  const activeId = useChatStore((s) => s.activeConversationId)
  const [listOpen, setListOpen] = useState(false)
  useEffect(() => setListOpen(false), [activeId])

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden md:-m-6">
      <div className={cn("md:flex md:w-auto [&>div]:w-full md:[&>div]:w-72", listOpen ? "flex w-full flex-col" : "hidden")}>
        <button
          type="button"
          onClick={() => setListOpen(false)}
          className="flex items-center gap-2 border-b px-4 py-2.5 text-sm text-muted-foreground md:hidden"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
          {t("chat.backToChat")}
        </button>
        <ConversationList />
      </div>
      <div className={cn("@container min-w-0 flex-1 flex-col", listOpen ? "hidden md:flex" : "flex")}>
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="flex items-center gap-2 border-b px-4 py-2.5 text-sm text-muted-foreground md:hidden"
        >
          <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} className="size-4" />
          {t("chat.conversations")}
        </button>
        <ChatArea />
      </div>
    </div>
  )
}
