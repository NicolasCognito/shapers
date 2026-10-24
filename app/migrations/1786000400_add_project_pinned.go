package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Each user can star projects; starred ones come first on the Board.
func init() {
	m.Register(func(app core.App) error {
		c, err := app.FindCollectionByNameOrId(boardProjectPreferencesCollection)
		if err != nil {
			return err
		}
		c.Fields.Add(&core.BoolField{Name: "pinned"})
		return app.Save(c)
	}, func(app core.App) error {
		c, err := app.FindCollectionByNameOrId(boardProjectPreferencesCollection)
		if err != nil {
			return err
		}
		c.Fields.RemoveByName("pinned")
		return app.Save(c)
	})
}
