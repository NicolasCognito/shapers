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
  /** i18n keys for title and description. */
  titleKey?: string
  descriptionKey?: string
  url: string
  icon: IconSvgElement
  description?: string
  /** Hide unless the user has this permission. */
  permission?: Permission
}

export type NavGroup = {
  label: string
  labelKey?: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: "Shapers",
    labelKey: "nav.groupShapers",
    items: [
      {
        title: "My week",
        titleKey: "nav.myWeek",
        descriptionKey: "nav.myWeekDesc",
        url: "/me",
        icon: UserIcon,
        description: "Your hours, meetings and streak",
      },
      {
        title: "My tasks",
        titleKey: "nav.myTasks",
        descriptionKey: "nav.myTasksDesc",
        url: "/tasks",
        icon: Task01Icon,
        description: "Everything assigned to you, across projects",
      },
      {
        title: "Requests",
        titleKey: "nav.requests",
        descriptionKey: "nav.requestsDesc",
        url: "/requests",
        icon: InboxIcon,
        description: "Older hours and task handoffs, with answers",
      },
      {
        title: "Team",
        titleKey: "nav.team",
        descriptionKey: "nav.teamDesc",
        url: "/team",
        icon: UserGroupIcon,
        description: "Hours, attendance and tasks for every member",
        permission: "team.view",
      },
    ],
  },
  {
    label: "Workflow",
    labelKey: "nav.groupWorkflow",
    items: [
      {
        title: "Board",
        titleKey: "nav.board",
        descriptionKey: "nav.boardDesc",
        url: "/board",
        icon: KanbanIcon,
        description: "All projects and tasks",
      },
      {
        title: "Jarvis",
        titleKey: "nav.jarvis",
        descriptionKey: "nav.jarvisDesc",
        url: "/chat",
        icon: Chat01Icon,
        description: "Your assistant: tasks, hours and meetings by chat",
      },
    ],
  },
  {
    label: "System",
    labelKey: "nav.groupSystem",
    items: [
      {
        title: "Settings",
        titleKey: "nav.settings",
        descriptionKey: "nav.settingsDesc",
        url: "/settings",
        icon: Settings02Icon,
        description: "Manage your preferences and API keys",
      },
    ],
  },
]

export const flatNavItems: NavItem[] = navGroups.flatMap((g) => g.items)
