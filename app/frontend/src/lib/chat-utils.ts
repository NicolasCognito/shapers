import i18n from "@/i18n"

// Lightweight relative-time formatter for the chat UI.

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso).getTime()
  const now = Date.now()
  const diff = now - date

  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour

  if (diff < min) return i18n.t("time.justNow")
  if (diff < hour) return i18n.t("time.minAgo", { count: Math.floor(diff / min) })
  if (diff < day) return i18n.t("time.hourAgo", { count: Math.floor(diff / hour) })
  if (diff < 7 * day) return i18n.t("time.dayAgo", { count: Math.floor(diff / day) })

  return new Date(iso).toLocaleDateString(i18n.language, {
    month: "short",
    day: "numeric",
  })
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
