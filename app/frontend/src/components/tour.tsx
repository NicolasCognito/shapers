import { useEffect } from "react"
import { useLocation, useNavigate, type NavigateFunction } from "react-router"
import { useTranslation } from "react-i18next"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import { HugeiconsIcon } from "@hugeicons/react"
import { HelpCircleIcon } from "@hugeicons/core-free-icons"

import { useSidebar } from "@/components/ui/sidebar-context"
import { askJarvis } from "@/lib/jarvis-ask"
import { can, jarvisVisible } from "@/lib/permissions"
import { pb } from "@/lib/pocketbase"
import { tourContent, type TourContent, type TourStepText } from "@/lib/tour-content"

// Interactive tour over the live app: one route per role, each step points
// at an element marked data-tour="…". It starts once per user and browser,
// and the sidebar button replays it. The last step offers questions that go
// straight to Jarvis.

type Step = {
  route?: string
  element?: string
  text: TourStepText
  /** Sidebar items: on a phone the menu is closed, so the menu button is highlighted instead. */
  sidebar?: boolean
  asks?: string[]
}

const el = (name: string) => `[data-tour="${name}"]`

function buildSteps(admin: boolean, c: TourContent): Step[] {
  if (admin) {
    return [
      { route: "/team", text: c.welcomeAdmin },
      { route: "/team", element: el("team-tiles"), text: c.teamTiles },
      { route: "/team", element: el("team-attention"), text: c.teamAttention },
      { route: "/team", element: el("tab-members"), text: c.tabMembers },
      { route: "/team", element: el("tab-attendance"), text: c.tabAttendance },
      { element: el("nav-requests"), text: c.adminRequests, sidebar: true },
      { element: el("nav-board"), text: c.navBoard, sidebar: true },
      { element: el("nav-me"), text: c.navMe, sidebar: true },
      { element: el("jarvis"), text: c.jarvis, asks: c.adminAsks },
    ]
  }
  return [
    { route: "/me", text: c.welcomeMember },
    { route: "/me", element: el("timer"), text: c.timer },
    { route: "/me", element: el("this-week"), text: c.thisWeek },
    { route: "/me", element: el("meetings"), text: c.meetings },
    { route: "/me", element: el("rules"), text: c.rules },
    { element: el("nav-tasks"), text: c.navTasks, sidebar: true },
    { element: el("nav-requests"), text: c.navRequests, sidebar: true },
    { element: el("nav-tree"), text: c.navTree, sidebar: true },
    ...(jarvisVisible() ? [{ element: el("jarvis"), text: c.jarvis, asks: c.memberAsks }] : []),
  ]
}

const doneKey = (uid: string) => `shapers.tourDone.${uid}`

function markDone() {
  const uid = pb.authStore.record?.id
  if (!uid) return
  try {
    localStorage.setItem(doneKey(uid), "1")
  } catch {
    /* storage unavailable: the tour may show again */
  }
}

function isDone(uid: string) {
  try {
    return localStorage.getItem(doneKey(uid)) === "1"
  } catch {
    return true // can't remember it, so don't nag on every load
  }
}

/** Waits until the element is on the page (data may still be loading). */
async function waitFor(selector: string, ms = 4000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const node = document.querySelector<HTMLElement>(selector)
    if (node && node.getClientRects().length > 0) return
    await new Promise((r) => setTimeout(r, 100))
  }
}

let running = false

function startTour(navigate: NavigateFunction, lang: string) {
  if (running) return
  running = true
  const c = tourContent(lang)
  const admin = can("team.view")
  const mobile = window.matchMedia("(max-width: 767px)").matches
  const steps = buildSteps(admin, c).map((s) => (mobile && s.sidebar ? { ...s, element: el("menu"), text: { ...s.text, title: `☰ ${s.text.title}` } } : s))

  const drv = driver({
    showProgress: true,
    progressText: c.progress,
    nextBtnText: c.next,
    prevBtnText: c.prev,
    doneBtnText: c.done,
    smoothScroll: true,
    stagePadding: 6,
    stageRadius: 12,
    popoverClass: "shapers-tour",
    steps: steps.map((s) => ({
      element: s.element,
      popover: { title: s.text.title, description: s.text.text },
    })),
    onNextClick: () => void go((drv.getActiveIndex() ?? 0) + 1),
    onPrevClick: () => void go((drv.getActiveIndex() ?? 0) - 1),
    onPopoverRender: (popover, { state }) => {
      const s = steps[state.activeIndex ?? 0]
      if (!s?.asks) return
      const box = document.createElement("div")
      box.className = "shapers-tour-asks"
      const label = document.createElement("p")
      label.textContent = c.tryIt
      box.appendChild(label)
      for (const q of s.asks) {
        const b = document.createElement("button")
        b.type = "button"
        b.textContent = q
        b.onclick = () => {
          drv.destroy()
          askJarvis(q)
        }
        box.appendChild(b)
      }
      popover.description.appendChild(box)
    },
    onDestroyed: () => {
      running = false
      markDone()
    },
  })

  const go = async (i: number) => {
    if (i < 0) return
    if (i >= steps.length) {
      drv.destroy()
      return
    }
    const s = steps[i]
    if (s.route && window.location.pathname !== s.route) navigate(s.route)
    if (s.element) await waitFor(s.element)
    drv.moveTo(i)
  }

  void (async () => {
    const first = steps[0]
    if (first.route && window.location.pathname !== first.route) navigate(first.route)
    await waitFor(steps[1]?.element ?? "body")
    drv.drive(0)
  })()
}

/** Mounted once in the dashboard layout: first visit starts the tour. */
export function TourAutostart() {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const uid = pb.authStore.record?.id
  // Don't pull people away from a QR check-in confirmation; start on the next page.
  const onCheckin = useLocation().pathname.startsWith("/checkin")
  useEffect(() => {
    if (!uid || isDone(uid) || onCheckin) return
    const id = setTimeout(() => startTour(navigate, i18n.language), 1000)
    return () => clearTimeout(id)
    // Once per sign-in; language changes don't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, onCheckin])
  return null
}

export function TourButton() {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const { isMobile, setOpenMobile } = useSidebar()
  const c = tourContent(i18n.language)
  const start = () => {
    if (isMobile) {
      // Close the menu sheet first, or its overlay sits on top of the tour.
      setOpenMobile(false)
      setTimeout(() => startTour(navigate, i18n.language), 350)
    } else startTour(navigate, i18n.language)
  }
  return (
    <button
      type="button"
      onClick={start}
      title={c.button}
      className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} className="size-4 shrink-0" />
      <span className="group-data-[collapsible=icon]:hidden">{c.button}</span>
    </button>
  )
}
