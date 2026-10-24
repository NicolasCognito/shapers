// Package team adds the volunteer-organisation features on top of the
// workavera workspace: member tiers, hours against weekly commitment,
// meeting attendance (meetings read from Google Calendar) and analytics.
package team

import (
	"log/slog"
	"os"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	colMeetings   = "meetings"
	colAttendance = "attendance"
	colHours      = "hour_logs"
	colUsers      = "users"
)

// Location is the organisation's timezone; weeks start on Monday here.
var Location = mustLoadLocation("Europe/Ljubljana")

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

// Register wires routes, the calendar sync job and the import command.
func Register(app *pocketbase.PocketBase) {
	app.RootCmd.AddCommand(newImportCommand(app))
	registerProjectHooks(app)

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		g := se.Router.Group("/api/team")
		g.Bind(apis.RequireAuth(colUsers))
		g.POST("/checkin", handleCheckin)
		g.GET("/me", handleMe)
		g.GET("/meetings/upcoming", handleUpcoming)
		g.POST("/attendance/bulk", requirePerm(PermAttendanceRecord, handleBulkAttendance))
		g.GET("/overview", requirePerm(PermTeamView, handleOverview))
		g.GET("/members/{id}", requirePerm(PermTeamView, handleMember))
		g.POST("/calendar/sync", requirePerm(PermCalendarSync, func(e *core.RequestEvent) error {
			n, err := SyncGoogleCalendar(e.App)
			if err != nil {
				return e.BadRequestError("Calendar sync failed: "+err.Error(), err)
			}
			return e.JSON(200, map[string]any{"synced": n})
		}))
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

func runSync(app core.App) {
	n, err := SyncGoogleCalendar(app)
	if err != nil {
		slog.Warn("google calendar sync failed", "error", err)
		return
	}
	slog.Info("google calendar synced", "meetings", n)
}

// WeekStart returns Monday 00:00 (organisation time) of the week containing t.
func WeekStart(t time.Time) time.Time {
	t = t.In(Location)
	offset := (int(t.Weekday()) + 6) % 7
	d := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, Location)
	return d.AddDate(0, 0, -offset)
}
