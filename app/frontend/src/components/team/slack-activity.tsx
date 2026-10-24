import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { create } from "zustand"

import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"

// Admin-only Slack activity signal. The server never sends this to members.

export type SlackMember = {
  id: string
  name: string
  slack_id: string
  slack_name: string
  active_now: boolean
  last_active: string | null
  messages_7d: number
  reactions_7d: number
  quiet_days: number // -1 = never seen
}

type SlackState = {
  enabled: boolean
  demoMapping: boolean
  members: Record<string, SlackMember>
  loaded: boolean
  load: () => Promise<void>
}

export const useSlack = create<SlackState>((set) => ({
  enabled: false,
  demoMapping: false,
  members: {},
  loaded: false,
  load: async () => {
    const r = await pb.send<{ enabled: boolean; demo_mapping?: boolean; members?: SlackMember[] }>("/api/team/slack", {})
    set({
      enabled: r.enabled,
      demoMapping: !!r.demo_mapping,
      members: Object.fromEntries((r.members ?? []).map((m) => [m.id, m])),
      loaded: true,
    })
  },
}))

const QUIET_AFTER_DAYS = 14

/** Compact cell for the Team table: dot + last seen + 7-day counts. */
export function SlackCell({ memberId }: { memberId: string }) {
  const { t } = useTranslation()
  const m = useSlack((s) => s.members[memberId])
  if (!m || !m.slack_id) return <span className="text-muted-foreground">—</span>
  const quiet = m.quiet_days < 0 || m.quiet_days >= QUIET_AFTER_DAYS
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span
        className={cn(
          "size-2 rounded-full",
          m.active_now ? "bg-emerald-500" : quiet ? "bg-rose-500" : "bg-muted-foreground/40"
        )}
      />
      <span className={cn(quiet && "text-rose-600 dark:text-rose-400")}>
        {m.active_now
          ? t("slack.activeNow")
          : m.quiet_days < 0
            ? t("slack.neverSeen")
            : t("slack.seenDaysAgo", { count: m.quiet_days })}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        💬{m.messages_7d} 👍{m.reactions_7d}
      </span>
    </span>
  )
}

/** Member sheet block: activity details, plus manual linking in demo mode. */
export function MemberSlack({ memberId }: { memberId: string }) {
  const { t } = useTranslation()
  const enabled = useSlack((s) => s.enabled)
  const demo = useSlack((s) => s.demoMapping)
  const m = useSlack((s) => s.members[memberId])
  const load = useSlack((s) => s.load)
  const [people, setPeople] = useState<{ id: string; name: string }[] | null>(null)

  useEffect(() => {
    void load().catch(() => {})
  }, [load])
  useEffect(() => {
    if (enabled && demo) {
      pb.send<{ id: string; name: string }[]>("/api/team/slack/people", {})
        .then(setPeople)
        .catch(() => setPeople([]))
    }
  }, [enabled, demo])

  if (!enabled || !m) return null

  const link = async (slackId: string) => {
    try {
      await pb.send("/api/team/slack/link", { method: "POST", body: { member: memberId, slack_id: slackId } })
      toast.success(slackId ? t("slack.linked") : t("slack.unlinked"))
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">Slack</span>
        <span className="text-xs text-muted-foreground">{t("slack.adminOnly")}</span>
      </div>
      {m.slack_id ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-muted-foreground">{m.slack_name}</span>
          <SlackCell memberId={memberId} />
        </div>
      ) : (
        <p className="text-muted-foreground">{t("slack.notLinked")}</p>
      )}
      {demo && people && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("slack.demoLink")}
          <select
            className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground"
            value={m.slack_id}
            onChange={(e) => void link(e.target.value)}
          >
            <option value="">{t("slack.noOne")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
