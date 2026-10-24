package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Remember the meeting time each Slack post announced, so a later change in
// Google Calendar can be followed up with a "rescheduled" note.
func init() {
	m.Register(func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("slack_posts")
		if err != nil {
			return err
		}
		c.Fields.Add(&core.DateField{Name: "start_at"})
		return app.Save(c)
	}, func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("slack_posts")
		if err != nil {
			return err
		}
		c.Fields.RemoveByName("start_at")
		return app.Save(c)
	})
}
