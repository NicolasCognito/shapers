package team

import "github.com/pocketbase/pocketbase/core"

// Permission is one thing a user may do beyond managing their own data.
// Every access check in this package goes through Can(); nothing else looks
// at roles. See docs/permissions.md for how to add a role.
type Permission string

const (
	PermTeamView         Permission = "team.view"         // org analytics, any member's history, all meetings
	PermAttendanceRecord Permission = "attendance.record" // record/fix attendance for anyone
	PermHoursManage      Permission = "hours.manage"      // view/edit anyone's hour logs
	PermMembersManage    Permission = "members.manage"    // change tier, weekly quota, role
	PermCalendarSync     Permission = "calendar.sync"     // trigger a Google Calendar sync
)

// Keep in sync with frontend/src/lib/permissions.ts and the rules in
// migrations/1786000000_create_team_collections.go (permRule).
var rolePermissions = map[string][]Permission{
	"member": {},
	"admin": {
		PermTeamView, PermAttendanceRecord, PermHoursManage,
		PermMembersManage, PermCalendarSync,
	},
}

// RoleOf returns the user's role. Today the roster only knows admin/member,
// stored as users.is_admin.
func RoleOf(u *core.Record) string {
	if u != nil && u.GetBool("is_admin") {
		return "admin"
	}
	return "member"
}

func Can(u *core.Record, p Permission) bool {
	if u == nil {
		return false
	}
	for _, have := range rolePermissions[RoleOf(u)] {
		if have == p {
			return true
		}
	}
	return false
}

func requirePerm(p Permission, next func(*core.RequestEvent) error) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if !Can(e.Auth, p) {
			return e.ForbiddenError("You don't have permission for this ("+string(p)+").", nil)
		}
		return next(e)
	}
}
