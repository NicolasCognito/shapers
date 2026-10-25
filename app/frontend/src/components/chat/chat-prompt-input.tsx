import { useTranslation } from "react-i18next"
import { useEffect, useMemo, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp02Icon, Loading03Icon, StopIcon } from "@hugeicons/core-free-icons"

import { JARVIS_ASK_EVENT, takePendingQuestion, takePendingVoice } from "@/lib/jarvis-ask"

import type { UseChatHelpers } from "@ai-sdk/react"
import type { ChatStatus } from "ai"

import {
  Context,
  ContextCacheCreationUsage,
  ContextCacheUsage,
  ContextCompactionThreshold,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextTotalsUsage,
  ContextTrigger,
  type ContextUsage,
} from "@/components/ai-elements/context"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { MicButton, VoiceLangChip } from "@/components/chat/voice-button"
import { useDictation } from "@/lib/use-dictation"
import { VoiceWaveform } from "@/components/chat/voice-waveform"
import { pb } from "@/lib/pocketbase"
import { useLlmSettingsStore } from "@/store/llm-settings"
import type { ChatUIMessage } from "@/types/chat"
import { cn } from "@/lib/utils"

export type ChatContextInfo = {
  usedTokens: number
  usage?: ContextUsage
  /** usedTokens is a character-based estimate (provider reported no usage). */
  estimated?: boolean
  /** Conversation-wide accumulated usage across every run. */
  totals?: {
    inputTokens: number
    outputTokens: number
  }
}

type Props = {
  conversationId: string
  modelConfigId?: string
  disabled?: boolean
  sendMessage: UseChatHelpers<ChatUIMessage>["sendMessage"]
  status: ChatStatus
  stop: UseChatHelpers<ChatUIMessage>["stop"]
  onMessageSubmitted?: (content: string) => void
  activeRunId?: string | null
  onRunStarted?: (runId: string) => void
  contextInfo?: ChatContextInfo
  /** The Jarvis panel: sends questions passed with askJarvis(). */
  acceptsAsk?: boolean
}

export function ChatPromptInput({
  conversationId,
  modelConfigId: initialModelConfigId,
  disabled = false,
  sendMessage,
  status,
  stop,
  onMessageSubmitted,
  activeRunId,
  onRunStarted,
  contextInfo,
  acceptsAsk = false,
}: Props) {
  const { t } = useTranslation()
  const models = useLlmSettingsStore((state) => state.models)
  const defaultModelId = useMemo(
    () => models.find((model) => model.isDefault)?.id ?? "",
    [models]
  )
  const [selectedModelConfigId, setSelectedModelConfigId] = useState<
    string | null
  >(initialModelConfigId || null)
  const modelConfigId = selectedModelConfigId ?? defaultModelId
  const [text, setText] = useState("")
  const dictation = useDictation({ text, setText })
  const voiceState = dictation.state

  const [askTick, setAskTick] = useState(0)
  useEffect(() => {
    if (!acceptsAsk) return
    const bump = () => setAskTick((n) => n + 1)
    window.addEventListener(JARVIS_ASK_EVENT, bump)
    return () => window.removeEventListener(JARVIS_ASK_EVENT, bump)
  }, [acceptsAsk])
  // The launcher's mic: start listening as soon as the engines are ready.
  useEffect(() => {
    if (!acceptsAsk || disabled || !dictation.supported || voiceState !== "idle") return
    if (takePendingVoice()) dictation.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptsAsk, askTick, disabled, dictation.supported])

  const handleSubmit = async (message: PromptInputMessage) => {
    const content = message.text.trim()
    if (
      !content ||
      !modelConfigId ||
      status === "submitted" ||
      status === "streaming"
    ) {
      return
    }
    const runId = crypto.randomUUID()
    onRunStarted?.(runId)
    setText("")
    onMessageSubmitted?.(content)
    await sendMessage(
      { text: content },
      { body: { runId, conversationId, modelConfigId } }
    )
  }

  // A question passed with askJarvis(): send it once the chat is ready.
  useEffect(() => {
    if (!acceptsAsk || disabled || !modelConfigId || status !== "ready") return
    const question = takePendingQuestion()
    // Sending a queued question is a one-off action per ask, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (question) void handleSubmit({ text: question, files: [] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptsAsk, askTick, disabled, modelConfigId, status])

  const handleStop = async () => {
    try {
      if (activeRunId) {
        await pb.send(`/api/chat/runs/${activeRunId}/stop`, {
          method: "POST",
          requestKey: null,
        })
      }
    } finally {
      await stop()
    }
  }

  const generating = status === "submitted" || status === "streaming"
  const canSend =
    !disabled && !!text.trim() && !!modelConfigId && models.length > 0
  const selectedModel = models.find((model) => model.id === modelConfigId)
  const voiceBusy = voiceState !== "idle"
  const micDisabled = disabled || generating || models.length === 0
  // The round button: mic while the input is empty, send once there is text,
  // stop while Jarvis answers.
  const primary: "mic" | "send" | "stop" =
    generating ? "stop" : voiceBusy || (!text.trim() && dictation.supported) ? "mic" : "send"

  return (
    <div className="p-3 px-4 @3xl:px-16 @5xl:px-24">
      <div className="flex items-end gap-2">
      <PromptInput onSubmit={handleSubmit} className="min-w-0 flex-1 rounded-xl">
        <PromptInputBody>
          {voiceState !== "idle" && <VoiceWaveform state={voiceState} />}
          <PromptInputTextarea
            placeholder={
              models.length === 0
                ? t("chat.configureModel")
                : t("chat.sendPlaceholder")
            }
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={disabled || models.length === 0}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputSelect
              value={modelConfigId}
              onValueChange={setSelectedModelConfigId}
            >
              <PromptInputSelectTrigger disabled={models.length === 0}>
                <PromptInputSelectValue placeholder={t("chat.selectModel")} />
              </PromptInputSelectTrigger>
              <PromptInputSelectContent>
                {models.map((model) => (
                  <PromptInputSelectItem key={model.id} value={model.id}>
                    {model.name}
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
            <VoiceLangChip dictation={dictation} />
            {selectedModel && contextInfo && (
              <Context
                maxTokens={selectedModel.maxContextTokens}
                usedTokens={contextInfo.usedTokens}
                usage={contextInfo.usage}
                estimated={contextInfo.estimated}
                totals={contextInfo.totals}
              >
                <ContextTrigger
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                />
                <ContextContent>
                  <ContextContentHeader />
                  <ContextContentBody className="space-y-1">
                    <ContextCacheUsage />
                    <ContextCacheCreationUsage />
                    <ContextCompactionThreshold />
                  </ContextContentBody>
                  <ContextContentBody className="space-y-1">
                    <ContextTotalsUsage />
                  </ContextContentBody>
                </ContextContent>
              </Context>
            )}
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
      {primary === "send" && dictation.supported && !voiceBusy && (
        <MicButton dictation={dictation} disabled={micDisabled} />
      )}
      {primary === "mic" ? (
        <MicButton dictation={dictation} disabled={micDisabled} big />
      ) : (
        <button
          type="button"
          onClick={() => (primary === "stop" ? void handleStop() : void handleSubmit({ text, files: [] }))}
          disabled={primary === "send" && !canSend}
          aria-label={primary === "stop" ? t("chat.stop") : t("chat.send")}
          title={primary === "stop" ? t("chat.stop") : t("chat.send")}
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full shadow-md transition-all disabled:opacity-40",
            primary === "stop" ? "bg-foreground text-background" : "bg-primary text-primary-foreground hover:scale-105"
          )}
        >
          <HugeiconsIcon
            icon={status === "submitted" ? Loading03Icon : primary === "stop" ? StopIcon : ArrowUp02Icon}
            strokeWidth={2}
            className={cn("size-6", status === "submitted" && "animate-spin")}
          />
        </button>
      )}
      </div>
    </div>
  )
}
