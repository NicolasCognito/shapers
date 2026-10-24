// askJarvis("…") opens the Jarvis panel and sends the question there.
// The panel's prompt input takes the pending question once it is ready.

export const JARVIS_ASK_EVENT = "jarvis-ask"

let pending: string | null = null

export function askJarvis(question: string) {
  pending = question
  window.dispatchEvent(new Event(JARVIS_ASK_EVENT))
}

export function takePendingQuestion(): string | null {
  const q = pending
  pending = null
  return q
}
