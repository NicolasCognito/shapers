// Package slack is the Slack integration: meeting announcements 3 days and
// reminders 1 day before (with the room QR code), reschedule/cancel notes,
// absence notices, and an admin-only activity signal (posts, reactions,
// presence). Everything is off unless SLACK_BOT_TOKEN is set.
//
// The team package calls NoticesNow, MeetingCancelled and AbsenceNotice;
// this package reads meetings and users straight from the database and never
// imports team.
package slack

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

// Env:
//   SLACK_BOT_TOKEN       xoxb-… (chat:write, users:read(.email), channels:read/history/join, reactions:read)
//   SLACK_SIGNING_SECRET  verifies events Slack sends to /api/slack/events
//   SLACK_CHANNEL         channel name for announcements (default all-shapershackathon)
//   PUBLIC_URL            app address used in links
//   SLACK_DEMO_MAPPING=1  admins may link members to Slack users by hand
//                         (sandbox emails don't exist in Slack); off in production

// Register starts the Slack jobs (when configured) and the Slack routes.
func Register(app *pocketbase.PocketBase) {
	token := strings.TrimSpace(os.Getenv("SLACK_BOT_TOKEN"))
	if token != "" {
		client = &slackClient{token: token, http: &http.Client{Timeout: 20 * time.Second}}
		app.OnServe().BindFunc(func(se *core.ServeEvent) error {
			go func() {
				syncSlackUsers(se.App)
				postMeetingNotices(se.App)
			}()
			return se.Next()
		})
		app.Cron().MustAdd("slack_notices", "*/10 * * * *", func() { postMeetingNotices(app) })
		app.Cron().MustAdd("slack_presence", "*/15 * * * *", func() { pollPresence(app) })
		app.Cron().MustAdd("slack_users", "7 * * * *", func() { syncSlackUsers(app) })
	}
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		registerSlackRoutes(se)
		return se.Next()
	})
}

func registerSlackRoutes(se *core.ServeEvent) {
	// Slack calls this; authenticity comes from the signing secret.
	se.Router.POST("/api/slack/events", handleSlackEvents)

	g := se.Router.Group("/api/team/slack")
	g.Bind(apis.RequireAuth(org.ColUsers))
	g.GET("", org.RequirePerm(org.PermTeamView, func(e *core.RequestEvent) error {
		if client == nil {
			return e.JSON(200, map[string]any{"enabled": false})
		}
		members, err := slackOverview(e.App)
		if err != nil {
			return e.InternalServerError("", err)
		}
		return e.JSON(200, map[string]any{"enabled": true, "demo_mapping": slackDemoMapping(), "members": members})
	}))
	g.GET("/people", org.RequirePerm(org.PermTeamView, func(e *core.RequestEvent) error {
		if client == nil || !slackDemoMapping() {
			return e.ForbiddenError("Manual Slack linking is off on this server.", nil)
		}
		people, err := client.people()
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		list := make([]map[string]string, 0, len(people))
		for _, p := range people {
			list = append(list, map[string]string{"id": p.ID, "name": p.display()})
		}
		return e.JSON(200, list)
	}))
	g.POST("/link", org.RequirePerm(org.PermMembersManage, func(e *core.RequestEvent) error {
		if client == nil || !slackDemoMapping() {
			return e.ForbiddenError("Manual Slack linking is off on this server.", nil)
		}
		var in struct {
			Member  string `json:"member"`
			SlackID string `json:"slack_id"`
		}
		if err := e.BindBody(&in); err != nil {
			return e.BadRequestError("", err)
		}
		u, err := e.App.FindRecordById(org.ColUsers, in.Member)
		if err != nil {
			return e.NotFoundError("", err)
		}
		name := ""
		if in.SlackID != "" {
			people, err := client.people()
			if err != nil {
				return e.BadRequestError(err.Error(), nil)
			}
			for _, p := range people {
				if p.ID == in.SlackID {
					name = p.display()
				}
			}
			if name == "" {
				return e.BadRequestError("No such Slack user.", nil)
			}
		}
		u.Set("slack_id", in.SlackID)
		u.Set("slack_name", name)
		if err := e.App.Save(u); err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, map[string]any{"ok": true})
	}))
}
