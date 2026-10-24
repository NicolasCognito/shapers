package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Slack extras: meeting announcements/reminders and the admin-only activity
// signal. Slack fields on users are hidden (never returned to members), and
// the two new collections have no API rules (server only).
func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId(usersCollectionName)
		if err != nil {
			return err
		}
		users.Fields.Add(
			&core.TextField{Name: "slack_id", Max: 40, Hidden: true},
			&core.TextField{Name: "slack_name", Max: 120, Hidden: true},
			&core.DateField{Name: "slack_last_active", Hidden: true},
		)
		if err := app.Save(users); err != nil {
			return err
		}
		meetings, err := app.FindCollectionByNameOrId("meetings")
		if err != nil {
			return err
		}

		posts := core.NewBaseCollection("slack_posts")
		posts.Fields.Add(
			&core.RelationField{Name: "meeting", CollectionId: meetings.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
			&core.SelectField{Name: "kind", MaxSelect: 1, Required: true, Values: []string{"announce", "remind"}},
			&core.TextField{Name: "channel", Max: 40},
			&core.TextField{Name: "ts", Max: 40},
			&core.AutodateField{Name: "created", OnCreate: true},
		)
		posts.AddIndex("idx_slack_posts_meeting_kind", true, "meeting, kind", "")
		if err := app.Save(posts); err != nil {
			return err
		}

		act := core.NewBaseCollection("slack_activity")
		act.Fields.Add(
			&core.TextField{Name: "slack_user", Max: 40, Required: true},
			&core.SelectField{Name: "kind", MaxSelect: 1, Required: true, Values: []string{"message", "reaction"}},
			&core.TextField{Name: "channel", Max: 40},
			&core.DateField{Name: "at", Required: true},
		)
		act.AddIndex("idx_slack_activity_user_at", false, "slack_user, at", "")
		return app.Save(act)
	}, func(app core.App) error {
		for _, n := range []string{"slack_activity", "slack_posts"} {
			if c, err := app.FindCollectionByNameOrId(n); err == nil {
				if err := app.Delete(c); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
