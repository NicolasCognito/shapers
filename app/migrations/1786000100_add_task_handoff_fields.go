package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Reserved for the task handoff flow (TODO 13/14): a task can wait for
// handoff_to to accept it, or sit in the pool with no assignee.
func init() {
	m.Register(func(app core.App) error {
		tasks, err := app.FindCollectionByNameOrId("board_tasks")
		if err != nil {
			return err
		}
		users, err := app.FindCollectionByNameOrId(usersCollectionName)
		if err != nil {
			return err
		}
		tasks.Fields.Add(
			&core.RelationField{Name: "handoff_to", CollectionId: users.Id, MaxSelect: 1},
			&core.BoolField{Name: "in_pool"},
		)
		return app.Save(tasks)
	}, func(app core.App) error {
		tasks, err := app.FindCollectionByNameOrId("board_tasks")
		if err != nil {
			return err
		}
		tasks.Fields.RemoveByName("handoff_to")
		tasks.Fields.RemoveByName("in_pool")
		return app.Save(tasks)
	})
}
