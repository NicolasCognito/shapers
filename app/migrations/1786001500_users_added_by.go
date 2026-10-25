package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Members an admin adds in the app (not from the roster import): added_by is
// the admin. Calendar sync puts them into meetings of their series, since
// their email is not in the calendar event descriptions yet.
func init() {
	m.Register(func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		c.Fields.Add(&core.RelationField{Name: "added_by", CollectionId: c.Id, MaxSelect: 1})
		return app.Save(c)
	}, func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		c.Fields.RemoveByName("added_by")
		return app.Save(c)
	})
}
