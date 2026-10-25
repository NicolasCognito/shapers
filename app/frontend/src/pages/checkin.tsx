import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon, Alert02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { extractErrorMessage } from "@/lib/error"
import { teamApi } from "@/lib/team"

/**
 * /checkin/:meeting — the link behind the room QR code. Opening it clocks
 * the member in (in person); no other step.
 */
export function CheckinPage() {
  const { t } = useTranslation()
  const { meeting = "" } = useParams()
  const [state, setState] = useState<"busy" | "ok" | "error">("busy")
  const [title, setTitle] = useState("")
  const [error, setError] = useState("")
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // StrictMode runs effects twice
    started.current = true
    teamApi
      .meeting(meeting)
      .then((m) => setTitle(m.title))
      .catch(() => {})
    teamApi
      .checkin(meeting, false)
      .then(() => {
        setState("ok")
        window.dispatchEvent(new Event("hours-changed"))
      })
      .catch((e) => {
        setError(extractErrorMessage(e, t("common.somethingWrong")))
        setState("error")
      })
  }, [meeting, t])

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {state === "busy" && <Spinner className="size-10" />}
      {state === "ok" && (
        <>
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.5} className="size-20 text-emerald-500" />
          <h1 className="text-2xl font-semibold">{t("checkin.youreIn")}</h1>
          {title && <p className="text-muted-foreground">{title}</p>}
        </>
      )}
      {state === "error" && (
        <>
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.5} className="size-16 text-amber-500" />
          <h1 className="text-xl font-semibold">{t("checkin.failed")}</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </>
      )}
      {state !== "busy" && (
        <Button asChild variant="outline">
          <Link to="/me">{t("checkin.toMyWeek")}</Link>
        </Button>
      )}
    </div>
  )
}
