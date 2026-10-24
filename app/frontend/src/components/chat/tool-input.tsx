import { useTranslation } from "react-i18next"
import i18n from "@/i18n"
import { CheckIcon, ChevronDownIcon, CopyIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

const MAX_PREVIEW_CHARS = 12_000
const MAX_STRING_CHARS = 2_000
const MAX_ARRAY_ITEMS = 10
const MAX_OBJECT_KEYS = 30
const MAX_DEPTH = 4
const MAX_NODES = 120

type ToolInputProps = {
  input: unknown
  className?: string
}

type PreviewContext = {
  nodes: number
  truncated: boolean
  seen: WeakSet<object>
}

type InputPreview = {
  text: string
  truncated: boolean
}

export function ToolInput({ input, className }: ToolInputProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimeout = useRef<number>(0)
  const summary = useMemo(() => formatSummary(input), [input])
  const preview = useMemo(
    () => (open ? formatPreview(input) : null),
    [input, open]
  )

  useEffect(
    () => () => {
      window.clearTimeout(copyTimeout.current)
    },
    []
  )

  if (!summary) return null

  const copyFullInput = async () => {
    if (!navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(formatFullInput(input))
      setCopied(true)
      window.clearTimeout(copyTimeout.current)
      copyTimeout.current = window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("overflow-hidden rounded-md border bg-muted/20", className)}
    >
      <div className="flex items-center gap-1">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left">
          <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {t("toolInput.parameters")}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {summary}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </CollapsibleTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mr-1 shrink-0"
          aria-label={t("toolInput.copyAll")}
          title={t("toolInput.copyAll")}
          onClick={() => void copyFullInput()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>

      <CollapsibleContent className="border-t">
        <pre className="max-h-80 overflow-auto px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap text-foreground">
          {preview?.text}
        </pre>
        {preview?.truncated && (
          <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
            {t("toolInput.limited", {
              chars: MAX_PREVIEW_CHARS.toLocaleString(),
              items: MAX_ARRAY_ITEMS,
              depth: MAX_DEPTH,
            })}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function formatSummary(input: unknown): string {
  const t = (key: string, options?: Record<string, unknown>) =>
    i18n.t(key, options)
  if (input === null) return "null"
  if (input === undefined) return ""
  if (typeof input === "string") return t("toolInput.chars", { count: input.length })
  if (typeof input !== "object") return String(input)
  if (Array.isArray(input)) return t("toolInput.items", { count: input.length })

  const entries = Object.entries(input as Record<string, unknown>)
  if (entries.length === 0) return ""
  const shown = entries
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${summarizeValue(value)}`)
  if (entries.length > shown.length) {
    shown.push(t("toolInput.moreFields", { count: entries.length - shown.length }))
  }
  return shown.join(" · ")
}

function summarizeValue(value: unknown): string {
  const t = (key: string, options?: Record<string, unknown>) =>
    i18n.t(key, options)
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  if (Array.isArray(value)) return t("toolInput.items", { count: value.length })
  if (typeof value === "object") {
    return t("toolInput.fields", { count: Object.keys(value as Record<string, unknown>).length })
  }
  if (typeof value === "string") {
    if (value.length > 48) return t("toolInput.chars", { count: value.length })
    return JSON.stringify(value)
  }
  return String(value)
}

function formatPreview(input: unknown): InputPreview {
  const context: PreviewContext = {
    nodes: 0,
    truncated: false,
    seen: new WeakSet<object>(),
  }
  const value = toPreviewValue(input, 0, context)
  let text =
    typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "")
  if (text.length > MAX_PREVIEW_CHARS) {
    text = `${text.slice(0, MAX_PREVIEW_CHARS)}\n${i18n.t("toolInput.shortened")}`
    context.truncated = true
  }
  return { text, truncated: context.truncated }
}

function toPreviewValue(
  value: unknown,
  depth: number,
  context: PreviewContext
): unknown {
  if (context.nodes >= MAX_NODES) {
    context.truncated = true
    return i18n.t("toolInput.nodeLimit")
  }
  context.nodes++

  if (typeof value === "string") {
    if (value.length <= MAX_STRING_CHARS) return value
    context.truncated = true
    return `${value.slice(0, MAX_STRING_CHARS)}${i18n.t("toolInput.moreChars", { count: value.length - MAX_STRING_CHARS })}`
  }
  if (value === null || typeof value !== "object") return value
  if (context.seen.has(value)) return "[Circular]"
  context.seen.add(value)

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) {
      context.truncated = true
      return i18n.t("toolInput.arrayHidden", { count: value.length })
    }
    const visible = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => toPreviewValue(item, depth + 1, context))
    if (value.length > visible.length) {
      context.truncated = true
      visible.push(i18n.t("toolInput.moreItems", { count: value.length - visible.length }))
    }
    return visible
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (depth >= MAX_DEPTH) {
    context.truncated = true
    return i18n.t("toolInput.objectHidden", { count: entries.length })
  }
  const visibleEntries = entries.slice(0, MAX_OBJECT_KEYS)
  const result: Record<string, unknown> = {}
  for (const [key, item] of visibleEntries) {
    result[key] = toPreviewValue(item, depth + 1, context)
  }
  if (entries.length > visibleEntries.length) {
    context.truncated = true
    result["…"] = i18n.t("toolInput.moreFieldsShort", { count: entries.length - visibleEntries.length })
  }
  return result
}

function formatFullInput(input: unknown): string {
  if (typeof input === "string") return input
  try {
    return JSON.stringify(input, null, 2) ?? String(input)
  } catch {
    return String(input)
  }
}
