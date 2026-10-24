import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { create } from "zustand"
import { HugeiconsIcon } from "@hugeicons/react"
import { DropletIcon } from "@hugeicons/core-free-icons"

import { Card } from "@/components/ui/card"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"

type Mood = "happy" | "calm" | "sad" | "wilted"
export type Tree = {
  drops: number
  waterings: number
  stage: number // 0 sprout … 4 blooming
  stage_progress: number
  mood: Mood
  days_dry: number
  bonus?: number
}

// Shared so the timer can refresh it after a planned session pays out water.
export const useTree = create<{ tree: Tree | null; load: () => Promise<void> }>((set) => ({
  tree: null,
  load: async () => {
    const tree = await pb.send<Tree>("/api/team/tree", {})
    set({ tree })
    if (tree.bonus) toast.success(`+${tree.bonus} 💧`)
  },
}))

const LEAF: Record<Mood, string> = {
  happy: "#34b36b",
  calm: "#4aa36a",
  sad: "#a3a83a",
  wilted: "#9a7b3c",
}
const LEAF_DARK: Record<Mood, string> = {
  happy: "#23915a",
  calm: "#378556",
  sad: "#838829",
  wilted: "#7a5f2c",
}

/** The tree itself: grows with stage, its face and colour follow the mood. */
function TreeArt({ stage, mood, watering }: { stage: number; mood: Mood; watering: boolean }) {
  const leaf = LEAF[mood]
  const leafDark = LEAF_DARK[mood]
  const droop = mood === "wilted" ? 10 : mood === "sad" ? 4 : 0
  // Crown size and trunk height per stage.
  const crown = [0, 26, 34, 42, 46][stage]
  const trunkH = [22, 26, 32, 38, 42][stage]
  const groundY = 132
  const trunkTop = groundY - trunkH
  const cy = trunkTop - crown * 0.55 + droop
  const faceY = stage === 0 ? groundY - 14 : cy + 2

  const eyes =
    mood === "happy" ? (
      <>
        <path d="M-9 0 q4 -5 8 0" />
        <path d="M1 0 q4 -5 8 0" />
      </>
    ) : mood === "wilted" ? (
      <>
        <path d="M-9 0 h7" />
        <path d="M2 0 h7" />
      </>
    ) : (
      <>
        <circle cx="-5.5" cy="-1" r="2" fill="#1f2a1f" stroke="none" />
        <circle cx="5.5" cy="-1" r="2" fill="#1f2a1f" stroke="none" />
        {mood === "sad" && (
          <>
            <path d="M-9 -6 l6 2" />
            <path d="M9 -6 l-6 2" />
          </>
        )}
      </>
    )
  const mouth = {
    happy: "M-6 6 q6 7 12 0",
    calm: "M-4 7 q4 2 8 0",
    sad: "M-5 9 q5 -5 10 0",
    wilted: "M-6 8 q3 -2 6 0 q3 2 6 0",
  }[mood]

  return (
    <svg viewBox="0 0 160 150" className="h-full w-full" role="img" aria-hidden>
      {/* ground */}
      <ellipse cx="80" cy={groundY + 4} rx="46" ry="9" className="fill-amber-900/25 dark:fill-amber-200/10" />
      {/* falling drop */}
      {watering && (
        <path
          d="M80 0 c-5 8 -8 12 -8 16 a8 8 0 0 0 16 0 c0 -4 -3 -8 -8 -16 z"
          className="tree-drop fill-sky-400"
        />
      )}
      <g className={cn("origin-bottom", watering && "tree-bounce")} style={{ transformOrigin: `80px ${groundY}px` }}>
        {/* trunk */}
        <path
          d={`M76 ${groundY} L77 ${trunkTop} Q80 ${trunkTop - 4} 83 ${trunkTop} L84 ${groundY} Z`}
          fill="#8a5a35"
        />
        {stage === 0 ? (
          <>
            {/* sprout: two leaves */}
            <path d={`M80 ${trunkTop + 2} q-16 -4 -20 -16 q14 0 20 14`} fill={leaf} />
            <path d={`M80 ${trunkTop + 2} q16 -6 22 -18 q-15 0 -22 16`} fill={leafDark} />
          </>
        ) : (
          <g transform={`rotate(${droop ? 4 : 0} 80 ${trunkTop})`}>
            <circle cx={80 - crown * 0.55} cy={cy + crown * 0.25} r={crown * 0.62} fill={leafDark} />
            <circle cx={80 + crown * 0.55} cy={cy + crown * 0.25} r={crown * 0.62} fill={leafDark} />
            <circle cx="80" cy={cy} r={crown} fill={leaf} />
            {stage === 4 &&
              [
                [-24, -18],
                [20, -24],
                [30, 4],
                [-32, 6],
                [4, -34],
              ].map(([x, y], i) => <circle key={i} cx={80 + x} cy={cy + y} r="4" fill="#f4a3c4" />)}
          </g>
        )}
        {/* face */}
        <g
          transform={`translate(80 ${faceY})`}
          stroke="#1f2a1f"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        >
          {eyes}
          <path d={mouth} />
          {mood === "happy" && (
            <>
              <circle cx="-12" cy="5" r="3" fill="#f4a3a3" stroke="none" opacity="0.7" />
              <circle cx="12" cy="5" r="3" fill="#f4a3a3" stroke="none" opacity="0.7" />
            </>
          )}
        </g>
      </g>
      <style>{`
        @keyframes tree-drop { from { transform: translateY(0); opacity: 1 } 85% { opacity: 1 } to { transform: translateY(${faceY - 20}px); opacity: 0 } }
        @keyframes tree-bounce { 0%,100% { transform: scale(1) } 40% { transform: scale(1.06, 0.94) } 70% { transform: scale(0.97, 1.04) } }
        .tree-drop { animation: tree-drop 0.7s ease-in forwards }
        .tree-bounce { animation: tree-bounce 0.6s ease-out 0.6s }
        @media (prefers-reduced-motion: reduce) { .tree-drop, .tree-bounce { animation: none } }
      `}</style>
    </svg>
  )
}

export function TreeCard() {
  const { t } = useTranslation()
  const tree = useTree((s) => s.tree)
  const load = useTree((s) => s.load)
  const [watering, setWatering] = useState(false)

  useEffect(() => {
    void load().catch(() => {})
  }, [load])

  if (!tree) return null

  const water = async () => {
    setWatering(true)
    try {
      const next = await pb.send<Tree>("/api/team/tree/water", { method: "POST" })
      setTimeout(() => useTree.setState({ tree: next }), 600)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setTimeout(() => setWatering(false), 1300)
    }
  }

  const moodLine =
    tree.mood === "happy"
      ? t("tree.happy")
      : t(`tree.${tree.mood}`, { count: tree.days_dry })

  return (
    <Card className="flex-row items-center gap-4 p-5">
      <div className="size-28 shrink-0">
        <TreeArt stage={tree.stage} mood={tree.mood} watering={watering} />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t(`tree.stage${tree.stage}`)}</p>
          <p className="text-base font-semibold">{moodLine}</p>
        </div>
        {tree.stage < 4 && (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" title={t("tree.nextStage")}>
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${tree.stage_progress * 100}%` }} />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void water()}
            disabled={watering || tree.drops < 1}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:bg-muted disabled:text-muted-foreground"
          >
            <HugeiconsIcon icon={DropletIcon} strokeWidth={2} className="size-4" />
            {t("tree.water")}
          </button>
          <span className="text-sm text-muted-foreground tabular-nums">{t("tree.drops", { count: tree.drops })}</span>
        </div>
        {tree.drops < 1 && <p className="text-xs text-muted-foreground">{t("tree.howToEarn")}</p>}
      </div>
    </Card>
  )
}
