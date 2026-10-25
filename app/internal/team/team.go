// Package team is the Shapers domain on top of the Workavera workspace:
// member tiers, weekly hours, meetings and attendance, requests, pauses,
// the tier rules from the organisers, the tree, and the analytics that tie
// them together.
//
// Where things are (files are grouped by prefix):
//
//	team.go             Register: hooks, jobs, the import command
//	routes.go           every HTTP route of this package, in one table
//	meetings*.go        calendar sync into meetings, upcoming list, room QR
//	attendance*.go      check-in, roll call, absence notices, meeting hours
//	hours.go            hour logs and the "today or yesterday" rule
//	timer.go            the work timer
//	requests*.go        hours / handoff / pause requests and their decisions
//	pauses.go           pause periods and their tier limits
//	community.go        Community attendance rules and GO! follow-up tasks
//	tasks.go            board task rules: owner, cancel/restore, completed lists
//	projects.go         who belongs to which board project
//	members.go          adding members, the Jarvis toggle
//	stats.go            the in-memory dataset behind all analytics
//	overview.go         My week, admin overview and member drill-down
//	reports.go          read-only queries for the Jarvis tools
//	settings.go         organisation settings (admin switches)
//	tree.go             the gamified tree
//	importer.go         `import-sandbox` CLI for the hackathon data
//
// Shared basics (timezone, permissions, collection names) live in
// internal/org; Slack and Google Calendar adapters in internal/slack and
// internal/gcal. Jarvis tools that call this package: internal/assistant/tools.
package team

import (
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// Register wires hooks, background jobs, routes and the import command.
func Register(app *pocketbase.PocketBase) {
	app.RootCmd.AddCommand(newImportCommand(app))

	registerProjectHooks(app)   // admins join every project
	registerTaskHooks(app)      // every task has an owner
	registerHourLimits(app)     // members log only today/yesterday
	registerCommunityRules(app) // GO! follow-up task for a missed Community meeting

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		registerRoutes(se)
		return se.Next()
	})

	if os.Getenv("GOOGLE_CALENDAR_ID") != "" {
		app.OnServe().BindFunc(func(se *core.ServeEvent) error {
			go runSync(se.App)
			return se.Next()
		})
		app.Cron().MustAdd("team_gcal_sync", "*/10 * * * *", func() { runSync(app) })
	}
}
