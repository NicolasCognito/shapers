import { useEffect, useState } from "react"
import { create } from "zustand"

import { pb } from "@/lib/pocketbase"

export type WorkTimer = {
  id: string
  started_at: string
  planned_minutes: number
  elapsed_minutes: number
}

export type StopResult = {
  ok: boolean
  elapsed_hours: number
  logged: boolean
  hours?: number
}

type WorkTimerState = {
  timer: WorkTimer | null
  loaded: boolean
  dialogOpen: boolean
  load: () => Promise<void>
  start: (plannedMinutes: number) => Promise<void>
  extend: (minutes: number) => Promise<void>
  stop: (opts: {
    log: boolean
    hours?: number
    note?: string
  }) => Promise<StopResult>
  openDialog: () => void
  closeDialog: () => void
}

export const useWorkTimer = create<WorkTimerState>((set, get) => ({
  timer: null,
  loaded: false,
  dialogOpen: false,
  load: async () => {
    try {
      const res = await pb.send<{ timer: WorkTimer | null }>(
        "/api/team/timer",
        { method: "GET" }
      )
      set({ timer: res.timer ?? null, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  start: async (plannedMinutes) => {
    const res = await pb.send<{ timer: WorkTimer | null }>(
      "/api/team/timer/start",
      { method: "POST", body: { planned_minutes: plannedMinutes } }
    )
    set({ timer: res.timer ?? null })
    if ("Notification" in window && Notification.permission === "default") {
      try {
        void Notification.requestPermission()
      } catch {
        // ignore
      }
    }
  },
  extend: async (minutes) => {
    const res = await pb.send<{ timer: WorkTimer | null }>(
      "/api/team/timer/extend",
      { method: "POST", body: { minutes } }
    )
    set({ timer: res.timer ?? null })
  },
  stop: async (opts) => {
    const res = await pb.send<StopResult>("/api/team/timer/stop", {
      method: "POST",
      body: opts,
    })
    set({ timer: null, dialogOpen: false })
    void get().load()
    return res
  },
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
}))

/** Re-renders the caller every `intervalMs` and returns Date.now(). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function elapsedSeconds(timer: WorkTimer, now: number): number {
  const started = new Date(timer.started_at).getTime()
  if (Number.isNaN(started)) return timer.elapsed_minutes * 60
  return Math.max(0, Math.floor((now - started) / 1000))
}

/** Planned end as epoch ms, or null for an open-ended timer. */
export function plannedEnd(timer: WorkTimer): number | null {
  if (!timer.planned_minutes) return null
  return new Date(timer.started_at).getTime() + timer.planned_minutes * 60_000
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

/** Keeps the timer in sync across devices: refetch on focus and every 60 s. */
export function useTimerSync() {
  useEffect(() => {
    const load = () => void useWorkTimer.getState().load()
    load()
    const id = setInterval(load, 60_000)
    window.addEventListener("focus", load)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", load)
    }
  }, [])
}
