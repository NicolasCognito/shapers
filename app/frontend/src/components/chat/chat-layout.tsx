import { ConversationList } from "./conversation-list"
import { ChatArea } from "./chat-area"

export function ChatLayout() {
  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden md:-m-6">
      <ConversationList />
      <div className="@container flex min-w-0 flex-1 flex-col">
        <ChatArea />
      </div>
    </div>
  )
}
