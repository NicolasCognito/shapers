import { useState } from "react"
import { useTranslation } from "react-i18next"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon, Mic01Icon, StopIcon } from "@hugeicons/core-free-icons"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { VOICE_LANGS } from "@/lib/voice"
import type { Dictation } from "@/lib/use-dictation"
import { cn } from "@/lib/utils"

/** Small chip with the spoken language; opens the language picker. */
export function VoiceLangChip({ dictation }: { dictation: Dictation }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { lang, setLang, state, supported } = dictation
  if (!supported) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={state !== "idle"}
          className="h-6 rounded-full border bg-muted/40 px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground disabled:opacity-50"
          aria-label={t("chat.voice.language")}
          title={t("chat.voice.language")}
        >
          🎤 {lang === "auto" ? t("chat.voice.auto") : lang}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="px-1 pb-2 text-xs text-muted-foreground">{t("chat.voice.languageHint")}</p>
        <div className="grid grid-cols-2 gap-1">
          {VOICE_LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLang(l.code)
                setOpen(false)
              }}
              className={cn(
                "rounded-full px-2.5 py-1 text-left text-xs transition-colors",
                l.code === "auto" && "col-span-2",
                lang === l.code ? "bg-emerald-500 font-medium text-white dark:bg-emerald-600" : "hover:bg-muted"
              )}
            >
              {l.code === "auto" ? t("chat.voice.autoLong") : l.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Round mic button next to the chat input. `big` is the main action when
 * the input is empty; the small one lets people keep dictating after text
 * is already there.
 */
export function MicButton({ dictation, disabled, big }: { dictation: Dictation; disabled?: boolean; big?: boolean }) {
  const { t } = useTranslation()
  const recording = dictation.state === "recording"
  const processing = dictation.state === "processing"
  const label = recording ? t("chat.voice.stop") : t("chat.voice.start")
  return (
    <button
      type="button"
      disabled={(disabled && !recording) || processing}
      onClick={dictation.toggle}
      aria-label={label}
      title={label}
      aria-pressed={recording}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-50",
        big ? "size-12" : "size-10",
        recording
          ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30 hover:bg-rose-600"
          : big
            ? "bg-primary text-primary-foreground shadow-md hover:scale-105"
            : "border bg-background text-foreground hover:bg-muted"
      )}
    >
      {recording && <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" aria-hidden />}
      <HugeiconsIcon
        icon={processing ? Loading03Icon : recording ? StopIcon : Mic01Icon}
        strokeWidth={2}
        className={cn("relative", big ? "size-6" : "size-5", processing && "animate-spin")}
      />
    </button>
  )
}
