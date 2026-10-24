import { useState } from "react"
import { useTranslation } from "react-i18next"
import { addDays, format, isValid, parseISO, startOfDay } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import { Calendar03Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useDateLocale } from "@/i18n"
import { cn } from "@/lib/utils"

/** How far back a member may ask the admins to log hours. */
export const REQUEST_WINDOW_DAYS = 14

/**
 * Date picker for logging hours. Only days that mean something are coloured:
 * blue = today/yesterday (log yourself), red = older days in the request
 * window (goes to admins). Future and older days are not selectable.
 */
export function LogDatePicker({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const [open, setOpen] = useState(false)
  const today = startOfDay(new Date())
  const yesterday = addDays(today, -1)
  const oldest = addDays(today, -REQUEST_WINDOW_DAYS)
  const selected = value ? parseISO(value) : undefined
  const valid = selected && isValid(selected)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start font-normal", className)}>
          <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} className="size-4" />
          {valid ? format(selected, "d MMM", { locale }) : t("memberDetail.pickDate")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={locale}
          weekStartsOn={1}
          selected={valid ? selected : undefined}
          defaultMonth={valid ? selected : today}
          disabled={[{ after: today }, { before: oldest }]}
          modifiers={{
            selfLog: [yesterday, today],
            request: { from: oldest, to: addDays(today, -2) },
          }}
          modifiersClassNames={{
            selfLog:
              "[&>button]:bg-sky-500/15 [&>button]:font-medium [&>button]:text-sky-700 dark:[&>button]:text-sky-300",
            request: "[&>button]:bg-rose-500/10 [&>button]:text-rose-700 dark:[&>button]:text-rose-300",
          }}
          onSelect={(d) => {
            if (!d) return
            onChange(format(d, "yyyy-MM-dd"))
            setOpen(false)
          }}
          autoFocus
        />
        <div className="flex flex-col gap-1 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-sky-500/60" />
            {t("memberDetail.legendSelf")}
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-rose-500/50" />
            {t("memberDetail.legendRequest")}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
