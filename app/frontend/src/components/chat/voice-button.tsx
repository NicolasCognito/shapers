import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon, Mic01Icon, StopIcon } from "@hugeicons/core-free-icons"

import { PromptInputButton } from "@/components/ai-elements/prompt-input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useVoiceInput, VOICE_LANGS, type VoiceLang } from "@/lib/voice"
import { cn } from "@/lib/utils"

const LANG_KEY = "shapers.voiceLang"

function readLang(): VoiceLang {
  try {
    const v = localStorage.getItem(LANG_KEY)
    if (v && VOICE_LANGS.some((l) => l.code === v)) return v as VoiceLang
  } catch {
    /* per-browser convenience only */
  }
  return "auto"
}

/**
 * Mic button for the chat input, with a small chip to pick the spoken language
 * (independent of the UI language; "Auto" lets Whisper detect it). Dictated
 * text is appended to what is already typed. The engine is chosen in lib/voice.
 */
export function VoiceButton({
  text,
  setText,
  disabled,
  onStateChange,
}: {
  text: string
  setText: (text: string) => void
  disabled?: boolean
  onStateChange?: (state: "idle" | "recording" | "processing") => void
}) {
  const { t, i18n } = useTranslation()
  const [lang, setLang] = useState<VoiceLang>(readLang)
  const [pickerOpen, setPickerOpen] = useState(false)
  const base = useRef("")
  const join = (spoken: string) => (base.current ? `${base.current} ${spoken}` : spoken)

  const voice = useVoiceInput({
    lang,
    fallbackLang: i18n.language?.startsWith("sl") ? "sl" : "en",
    onPartial: (s) => setText(join(s)),
    onText: (s) => setText(join(s)),
    onError: (m) => toast.error(t("chat.voice.error", { message: m })),
  })

  useEffect(() => {
    onStateChange?.(voice.state)
  }, [voice.state, onStateChange])

  if (!voice.supported) return null

  const recording = voice.state === "recording"
  const processing = voice.state === "processing"
  const busy = recording || processing

  const pick = (code: VoiceLang) => {
    setLang(code)
    setPickerOpen(false)
    try {
      localStorage.setItem(LANG_KEY, code)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex items-center">
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={busy}
            className="h-6 rounded-full border bg-muted/40 px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground disabled:opacity-50"
            aria-label={t("chat.voice.language")}
            title={t("chat.voice.language")}
          >
            {lang === "auto" ? t("chat.voice.auto") : lang}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-2">
          <p className="px-1 pb-2 text-xs text-muted-foreground">{t("chat.voice.languageHint")}</p>
          <div className="grid grid-cols-2 gap-1">
            {VOICE_LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => pick(l.code)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-left text-xs transition-colors",
                  l.code === "auto" && "col-span-2",
                  lang === l.code
                    ? "bg-emerald-500 font-medium text-white dark:bg-emerald-600"
                    : "hover:bg-muted"
                )}
              >
                {l.code === "auto" ? t("chat.voice.autoLong") : l.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
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
    </div>
  )
}
