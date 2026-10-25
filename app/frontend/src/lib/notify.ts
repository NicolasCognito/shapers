import { toast, type ExternalToast } from "sonner"

/**
 * The one place the app shows pop-up notifications (top right, see the
 * <Toaster> in main.tsx). Call these instead of importing sonner directly,
 * so position, timing and style stay consistent and can change here.
 *
 * Rule of thumb: don't notify about something the screen already shows
 * (a switch that flipped, a row that appeared). Notify about results that
 * happen elsewhere, errors, and actions with Undo.
 */
export const notify = {
  success: (message: string, opts?: ExternalToast) => toast.success(message, opts),
  error: (message: string, opts?: ExternalToast) => toast.error(message, opts),
  info: (message: string, opts?: ExternalToast) => toast.info(message, opts),
  warning: (message: string, opts?: ExternalToast) => toast.warning(message, opts),
  /** Neutral message without an icon. */
  message: (message: string, opts?: ExternalToast) => toast(message, opts),
  /** Spinner until the same id is updated with success/error. */
  loading: (message: string, opts?: ExternalToast) => toast.loading(message, opts),
  dismiss: (id?: string | number) => toast.dismiss(id),
}
