import type { IconSvgElement } from "@hugeicons/react"
import {
  KanbanIcon,
  Chat01Icon,
  Settings02Icon,
  UserIcon,
  Task01Icon,
  UserGroupIcon,
  InboxIcon,
} from "@hugeicons/core-free-icons"

import type { Permission } from "@/lib/permissions"

export type NavItem = {
  title: string
  url: string
  icon: IconSvgElement
  description?: string
  /** Hide unless the user has this permission. */
  permission?: Permission
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: "Shapers",
    items: [
      {
        title: "My week",
        url: "/me",
        icon: UserIcon,
        description: "Your hours, meetings and streak",
      },
      {
        title: "My tasks",
        url: "/tasks",
        icon: Task01Icon,
        description: "Everything assigned to you, across projects",
      },
      {
        title: "Requests",
        url: "/requests",
        icon: InboxIcon,
        description: "Older hours and task handoffs, with answers",
      },
      {
        title: "Team",
        url: "/team",
        icon: UserGroupIcon,
        description: "Hours, attendance and tasks for every member",
        permission: "team.view",
      },
    ],
  },
  {
    label: "Workflow",
    items: [
      {
        title: "Board",
        url: "/board",
        icon: KanbanIcon,
        description: "All projects and tasks",
      },
      {
        title: "Jarvis",
        url: "/chat",
        icon: Chat01Icon,
        description: "Your assistant: tasks, hours and meetings by chat",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        title: "Settings",
        url: "/settings",
        icon: Settings02Icon,
        description: "Manage your preferences and API keys",
      },
    ],
  },
]

export const flatNavItems: NavItem[] = navGroups.flatMap((g) => g.items)
