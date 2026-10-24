import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { WorkTimerCard } from "@/components/team/work-timer-card"
import { TreeCard } from "@/components/team/tree-card"
import { MemberDetailView } from "@/components/team/member-detail"
import { Skeleton } from "@/components/ui/skeleton"
import { teamApi, type MemberDetail } from "@/lib/team"

export function MyWeekPage() {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<MemberDetail | null>(null)
  const [error, setError] = useState("")

  const load = useCallback(() => {
    teamApi
      .me()
      .then(setDetail)
      .catch((e) => setError(String(e?.message ?? e)))
  }, [])

  useEffect(() => {
    load()
    window.addEventListener("hours-changed", load)
    return () => window.removeEventListener("hours-changed", load)
  }, [load])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {detail
            ? t("myWeek.hi", { name: detail.summary.name.split(" ")[0] })
            : t("myWeek.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("myWeek.subtitle")}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <WorkTimerCard />
        <TreeCard />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!detail && !error && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-56 lg:col-span-2" />
          <Skeleton className="h-56" />
          <Skeleton className="h-64 lg:col-span-3" />
        </div>
      )}
      {detail && <MemberDetailView detail={detail} editable onChanged={load} />}
    </div>
  )
}
