package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Work timers can be paused: paused_at marks a running pause, paused_seconds
// sums the finished ones. Paused time is not work and is never logged.
func init() {
	m.Register(func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("work_timers")
		if err != nil {
			return err
		}
		c.Fields.Add(
			&core.DateField{Name: "paused_at"},
			&core.NumberField{Name: "paused_seconds", OnlyInt: true},
		)
		return app.Save(c)
	}, func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("work_timers")
		if err != nil {
			return err
		}
		c.Fields.RemoveByName("paused_at")
		c.Fields.RemoveByName("paused_seconds")
		return app.Save(c)
	})
}
