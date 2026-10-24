package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// One running work timer per member. Only /api/team/timer endpoints touch it
// (no record API rules), so the server decides how much time gets logged.
func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId(usersCollectionName)
		if err != nil {
			return err
		}
		t := core.NewBaseCollection("work_timers")
		t.Fields.Add(
			&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
			&core.DateField{Name: "started_at", Required: true},
			&core.NumberField{Name: "planned_minutes", OnlyInt: true},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		t.AddIndex("idx_work_timers_user", true, "user", "")
		if err := app.Save(t); err != nil {
			return err
		}
		hours, err := app.FindCollectionByNameOrId("hour_logs")
		if err != nil {
			return err
		}
		if f, ok := hours.Fields.GetByName("source").(*core.SelectField); ok {
			f.Values = []string{"manual", "import", "agent", "request", "timer"}
		}
		return app.Save(hours)
	}, func(app core.App) error {
		if c, err := app.FindCollectionByNameOrId("work_timers"); err == nil {
			return app.Delete(c)
		}
		return nil
	})
}
