package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Hours can come from attending a meeting (server setting
// team.meeting_hours): source "meeting" plus a link to the meeting, so
// changing the attendance updates or removes exactly that entry.
func init() {
	m.Register(func(app core.App) error {
		hours, err := app.FindCollectionByNameOrId("hour_logs")
		if err != nil {
			return err
		}
		meetings, err := app.FindCollectionByNameOrId("meetings")
		if err != nil {
			return err
		}
		if f, ok := hours.Fields.GetByName("source").(*core.SelectField); ok {
			f.Values = []string{"manual", "import", "agent", "request", "timer", "meeting"}
		}
		hours.Fields.Add(&core.RelationField{Name: "meeting", CollectionId: meetings.Id, MaxSelect: 1, CascadeDelete: true})
		return app.Save(hours)
	}, func(app core.App) error {
		hours, err := app.FindCollectionByNameOrId("hour_logs")
		if err != nil {
			return err
		}
		hours.Fields.RemoveByName("meeting")
		if f, ok := hours.Fields.GetByName("source").(*core.SelectField); ok {
			f.Values = []string{"manual", "import", "agent", "request", "timer"}
		}
		return app.Save(hours)
	})
}
