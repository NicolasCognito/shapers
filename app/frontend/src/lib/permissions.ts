import { pb } from "@/lib/pocketbase"

// Mirrors internal/team/permissions.go. The UI only hides what the server
// would refuse anyway; the server is the source of truth.
// See docs/permissions.md for how to add a role.
export type Permission =
  | "team.view"
  | "attendance.record"
  | "hours.manage"
  | "members.manage"
  | "calendar.sync"
  | "tasks.moderate"

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  member: [],
  admin: [
    "team.view",
    "attendance.record",
    "hours.manage",
    "members.manage",
    "calendar.sync",
    "tasks.moderate",
  ],
}

export function currentRole(): string {
  return pb.authStore.record?.is_admin ? "admin" : "member"
}

export function can(permission: Permission): boolean {
  return ROLE_PERMISSIONS[currentRole()]?.includes(permission) ?? false
}
