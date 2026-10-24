package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Conversations started from the floating Jarvis panel are kept apart from
// the /chat list: source = "dock". Empty means a regular chat.
func init() {
	m.Register(func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("chat_conversations")
		if err != nil {
			return err
		}
		c.Fields.Add(&core.SelectField{Name: "source", MaxSelect: 1, Values: []string{"dock"}})
		return app.Save(c)
	}, func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("chat_conversations")
		if err != nil {
			return err
		}
		c.Fields.RemoveByName("source")
		return app.Save(c)
	})
}
