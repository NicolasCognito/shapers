// Voice input is a strategy: every engine turns speech into text the same way
// from the UI's point of view. Add an engine = add a file implementing this
// interface and list it in ./index.ts. The mic button never changes.

export type VoiceState = "idle" | "recording" | "processing"

export type VoiceCallbacks = {
  /** Live, not-yet-final text (engines that can stream it). */
  onPartial?: (text: string) => void
  /** Final text of one utterance. */
  onFinal: (text: string) => void
  onState: (state: VoiceState) => void
  /** `fallback: true` means another engine may succeed where this one failed. */
  onError: (message: string, opts?: { fallback?: boolean }) => void
}

export interface SpeechEngine {
  readonly id: string
  /** True if it can work out the spoken language itself (start gets lang ""). */
  readonly detectsLanguage?: boolean
  /** Can it work in this browser/app right now? */
  available(): boolean | Promise<boolean>
  /** lang is a BCP-47 tag like "en-US" or "sl-SI", or "" to auto-detect. */
  start(lang: string, cb: VoiceCallbacks): void | Promise<void>
  /** Finish and deliver what was said. */
  stop(): void
  /** Abort without delivering text. */
  cancel(): void
}
