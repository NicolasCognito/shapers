import { useTranslation } from "react-i18next"
import { QRCodeSVG } from "qrcode.react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * Big QR code for a meeting, to put on the room screen: members scan it
 * with the phone camera and are clocked in (see pages/checkin.tsx).
 */
export function MeetingQrDialog({
  meeting,
  onClose,
}: {
  meeting: { id: string; title: string } | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const url = meeting ? `${window.location.origin}/checkin/${meeting.id}` : ""
  return (
    <Dialog open={!!meeting} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{meeting?.title}</DialogTitle>
          <DialogDescription>{t("checkin.qrHint")}</DialogDescription>
        </DialogHeader>
        {meeting && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-4">
              <QRCodeSVG value={url} size={280} marginSize={0} className="h-auto w-full max-w-[280px]" />
            </div>
            <p className="max-w-full truncate font-mono text-xs text-muted-foreground">{url}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
