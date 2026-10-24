import { useEffect, useRef } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"

type Part = { toolCallId: string; state: string; output?: unknown }

function target(output: unknown): { path: string; label: string } | null {
  let o: unknown = output
  if (typeof o === "string") {
    try {
      o = JSON.parse(o)
    } catch {
      return null
    }
  }
  const v = o as { navigate?: unknown; label?: unknown } | null
  if (!v || typeof v.navigate !== "string" || !v.navigate.startsWith("/")) return null
  return { path: v.navigate, label: typeof v.label === "string" ? v.label : "" }
}

/**
 * Result of Jarvis' ui_navigate tool. Opens the page once, when the result
 * arrives live; results already present when the chat loads (history) only
 * show a link, so reopening a conversation never jumps around.
 */
export function NavigateToolCard({ part }: { part: Part }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const doneAtMount = useRef(part.state === "output-available")
  const handled = useRef(false)
  const dest = part.state === "output-available" ? target(part.output) : null

  useEffect(() => {
    if (!dest || doneAtMount.current || handled.current) return
    handled.current = true
    if (location.pathname + location.search !== dest.path) navigate(dest.path)
  }, [dest, location, navigate])

  if (part.state === "output-error") return null
  if (!dest) {
    return <p className="text-xs text-muted-foreground">{t("chat.navigate.opening")}</p>
  }
  return (
    <Link
      to={dest.path}
      className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} className="size-3.5" />
      {dest.label || t("chat.navigate.opened")}
    </Link>
  )
}
