package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Admins can put a member's tree on vacation: it stays happy while they're away.
func init() {
	m.Register(func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("trees")
		if err != nil {
			return err
		}
		c.Fields.Add(&core.BoolField{Name: "vacation"})
		return app.Save(c)
	}, func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("trees")
		if err != nil {
			return err
		}
		c.Fields.RemoveByName("vacation")
		return app.Save(c)
	})
}
