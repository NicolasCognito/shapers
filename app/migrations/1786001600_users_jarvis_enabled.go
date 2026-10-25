package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// jarvis_enabled shows the Jarvis button to a member. Admins always see it;
// for members it is off until an admin turns it on. Only the UI hides it.
func init() {
	m.Register(func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		c.Fields.Add(&core.BoolField{Name: "jarvis_enabled"})
		return app.Save(c)
	}, func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		c.Fields.RemoveByName("jarvis_enabled")
		return app.Save(c)
	})
}
