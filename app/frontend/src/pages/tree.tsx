import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/notify"
import { HugeiconsIcon } from "@hugeicons/react"
import { DropletIcon, HelpCircleIcon } from "@hugeicons/core-free-icons"

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Skeleton } from "@/components/ui/skeleton"
import { TreeArt } from "@/components/team/tree-card"
import { useTree, type Tree } from "@/lib/tree-store"
import { pb } from "@/lib/pocketbase"

const WATERINGS_PER_STAGE = 5

/** Rules on hover: kept off the page so the tree stays the only thing in view. */
function HowToPlay() {
  const { t } = useTranslation()
  return (
    <HoverCard openDelay={100} closeDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} className="size-4" />
          {t("tree.howToPlay")}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80 text-sm">
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
        </ul>
        <p className="mt-3 text-muted-foreground">{t("tree.growHint", { n: WATERINGS_PER_STAGE })}</p>
        <p className="mt-2 text-muted-foreground">{t("tree.moodHint")}</p>
        <p className="mt-2 text-muted-foreground">{t("tree.vacationRule")}</p>
      </HoverCardContent>
    </HoverCard>
  )
}

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
      notify.error((e as Error).message)
    } finally {
      setTimeout(() => setWatering(false), 1300)
    }
  }

  const demo = async (action: "skip-day" | "add-water" | "reset") => {
    try {
      const next = await pb.send<Tree>(`/api/team/tree/demo/${action}`, { method: "POST" })
      useTree.setState({ tree: next })
    } catch (e) {
      notify.error((e as Error).message)
    }
  }

  const moodLine = tree.vacation
    ? t("tree.onVacation")
    : tree.mood === "happy"
      ? t("tree.happy")
      : t(`tree.${tree.mood}`, { count: tree.days_dry })
  const done = Math.round(tree.stage_progress * WATERINGS_PER_STAGE)

  return (
    <div className="grid min-h-[calc(100svh-8rem)] grid-cols-1 items-center gap-6 md:grid-cols-[12rem_minmax(0,1fr)_12rem]">
      {/* Left: demo controls (removed for release) */}
      <div className="order-3 flex justify-center md:order-1 md:justify-start md:self-end">
        {tree.demo && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-dashed p-3 md:flex-col">
            <p className="w-full text-xs text-muted-foreground">{t("tree.demoTitle")}</p>
            <button type="button" onClick={() => void demo("skip-day")} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
              {t("tree.demoSkip")}
            </button>
            <button type="button" onClick={() => void demo("add-water")} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
              {t("tree.demoWater")}
            </button>
            <button
              type="button"
              onClick={() => void demo("reset")}
              className="rounded-full border px-3 py-1 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            >
              {t("tree.demoReset")}
            </button>
          </div>
        )}
      </div>

      {/* Centre: the tree */}
      <div className="order-2 flex flex-col items-center gap-4 text-center">
        <div className="size-56 sm:size-64">
          <TreeArt stage={tree.stage} mood={tree.mood} watering={watering} />
        </div>
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">{t("nav.tree")}</h1>
          <p className="text-muted-foreground">
            {t(`tree.stage${tree.stage}`)}, {moodLine.charAt(0).toLowerCase() + moodLine.slice(1)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void water()}
            disabled={watering || tree.drops < 1}
            className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-6 py-2.5 text-base font-medium text-white shadow-sm transition-colors hover:bg-sky-600 focus-visible:ring-4 focus-visible:ring-sky-500/30 focus-visible:outline-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
          >
            <HugeiconsIcon icon={DropletIcon} strokeWidth={2} className="size-5" />
            {t("tree.water")}
          </button>
          <span className="text-sm text-muted-foreground tabular-nums">{t("tree.drops", { count: tree.drops })}</span>
        </div>
        {tree.stage < 4 && (
          <div className="w-full max-w-xs space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
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
      </div>

      {/* Right: rules on hover */}
      <div className="order-1 flex justify-end md:order-3 md:self-start">
        <HowToPlay />
      </div>
    </div>
  )
}
