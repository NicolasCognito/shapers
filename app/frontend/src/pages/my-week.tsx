import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

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
