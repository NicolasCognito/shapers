import { create } from "zustand"

import { pb } from "@/lib/pocketbase"

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
