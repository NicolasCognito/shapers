import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon, Mic01Icon, StopIcon } from "@hugeicons/core-free-icons"

import { PromptInputButton } from "@/components/ai-elements/prompt-input"
import { useVoiceInput } from "@/lib/voice"
import { cn } from "@/lib/utils"

/**
 * Mic button for the chat input. Dictated text is appended to whatever is
 * already typed; engines that stream show it live. The engine (browser or
 * server/Whisper) is chosen in lib/voice — this component doesn't care.
 */
export function VoiceButton({
  text,
  setText,
  disabled,
}: {
  text: string
  setText: (text: string) => void
  disabled?: boolean
}) {
  const { t, i18n } = useTranslation()
  const base = useRef("")
  const join = (spoken: string) => (base.current ? `${base.current} ${spoken}` : spoken)

  const voice = useVoiceInput({
    lang: i18n.language?.startsWith("sl") ? "sl" : "en",
    onPartial: (s) => setText(join(s)),
    onText: (s) => setText(join(s)),
    onError: (m) => toast.error(t("chat.voice.error", { message: m })),
  })

  if (!voice.supported) return null

  const recording = voice.state === "recording"
  const processing = voice.state === "processing"

  return (
    <PromptInputButton
      type="button"
      disabled={disabled || processing}
      onClick={() => {
        if (!recording) base.current = text.trim()
        voice.toggle()
      }}
      tooltip={recording ? t("chat.voice.stop") : t("chat.voice.start")}
      aria-label={recording ? t("chat.voice.stop") : t("chat.voice.start")}
      aria-pressed={recording}
      className={cn(recording && "animate-pulse bg-rose-500/15 text-rose-600 hover:bg-rose-500/20")}
    >
      <HugeiconsIcon
        icon={processing ? Loading03Icon : recording ? StopIcon : Mic01Icon}
        strokeWidth={2}
        className={cn("size-4", processing && "animate-spin")}
      />
    </PromptInputButton>
  )
}
