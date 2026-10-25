import { create } from "zustand"

import { notify } from "@/lib/notify"
import { pb } from "@/lib/pocketbase"

export type Mood = "happy" | "calm" | "sad" | "wilted"
export type Tree = {
  drops: number
  waterings: number
  stage: number // 0 sprout … 4 blooming
  stage_progress: number
  mood: Mood
  days_dry: number
  bonus?: number
  vacation?: boolean
  demo?: boolean
}

// Shared so the timer can refresh it after a planned session pays out water.
export const useTree = create<{ tree: Tree | null; load: () => Promise<void> }>((set) => ({
  tree: null,
  load: async () => {
    const tree = await pb.send<Tree>("/api/team/tree", {})
    set({ tree })
    if (tree.bonus) notify.success(`+${tree.bonus} 💧`)
  },
}))
