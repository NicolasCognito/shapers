import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { DropletIcon } from "@hugeicons/core-free-icons"

import { Skeleton } from "@/components/ui/skeleton"
import { TreeArt, useTree, type Tree } from "@/components/team/tree-card"
import { pb } from "@/lib/pocketbase"

const WATERINGS_PER_STAGE = 5

export function TreePage() {
  const { t } = useTranslation()
  const tree = useTree((s) => s.tree)
  const load = useTree((s) => s.load)
  const [watering, setWatering] = useState(false)

  useEffect(() => {
    void load().catch(() => {})
  }, [load])

  if (!tree) return <Skeleton className="mx-auto h-96 max-w-xl" />

  const water = async () => {
    setWatering(true)
    try {
      const next = await pb.send<Tree>("/api/team/tree/water", { method: "POST" })
      setTimeout(() => useTree.setState({ tree: next }), 650)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setTimeout(() => setWatering(false), 1300)
    }
  }

  const moodLine = tree.mood === "happy" ? t("tree.happy") : t(`tree.${tree.mood}`, { count: tree.days_dry })
  const done = Math.round(tree.stage_progress * WATERINGS_PER_STAGE)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 py-4 text-center">
      <div className="relative size-72 sm:size-80">
        <div className="absolute inset-x-6 bottom-6 top-10 rounded-full bg-emerald-500/5 dark:bg-emerald-400/5" aria-hidden />
        <div className="relative size-full">
          <TreeArt stage={tree.stage} mood={tree.mood} watering={watering} />
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Happy Little Tree</h1>
        <p className="text-lg text-muted-foreground">
          {t(`tree.stage${tree.stage}`)}, {moodLine.charAt(0).toLowerCase() + moodLine.slice(1)}
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => void water()}
          disabled={watering || tree.drops < 1}
          className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-sky-600 focus-visible:ring-4 focus-visible:ring-sky-500/30 focus-visible:outline-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
        >
          <HugeiconsIcon icon={DropletIcon} strokeWidth={2} className="size-5" />
          {t("tree.water")}
        </button>
        <p className="text-sm text-muted-foreground tabular-nums">{t("tree.drops", { count: tree.drops })}</p>
      </div>

      {tree.stage < 4 && (
        <div className="w-full max-w-xs space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${tree.stage_progress * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("tree.toNext", { done, total: WATERINGS_PER_STAGE, stage: t(`tree.stage${tree.stage + 1}`) })}
          </p>
        </div>
      )}

      <div className="w-full max-w-sm rounded-xl border p-4 text-left text-sm">
        <p className="mb-2 font-medium">{t("tree.howTitle")}</p>
        <ul className="space-y-1.5 text-muted-foreground">
          <li className="flex justify-between gap-4">
            <span>{t("tree.earnPlan")}</span>
            <span className="shrink-0 font-medium text-foreground">+1 💧</span>
          </li>
          <li className="flex justify-between gap-4">
            <span>{t("tree.earnQuota")}</span>
            <span className="shrink-0 font-medium text-foreground">+3 💧</span>
          </li>
          <li className="pt-1 text-xs">{t("tree.moodHint")}</li>
        </ul>
      </div>
    </div>
  )
}
