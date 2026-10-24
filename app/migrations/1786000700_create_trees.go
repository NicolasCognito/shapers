package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Each member grows a little tree: water drops are earned by finishing
// planned work sessions and the weekly quota, and spent on watering.
// Only /api/team/tree endpoints change it (no record API rules).
func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId(usersCollectionName)
		if err != nil {
			return err
		}
		t := core.NewBaseCollection("trees")
		t.Fields.Add(
			&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
			&core.NumberField{Name: "drops", OnlyInt: true},
			&core.NumberField{Name: "waterings", OnlyInt: true},
			&core.DateField{Name: "last_watered_at"},
			&core.TextField{Name: "quota_bonus_week", Max: 10}, // YYYY-MM-DD of the last rewarded week
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		t.AddIndex("idx_trees_user", true, "user", "")
		return app.Save(t)
	}, func(app core.App) error {
		if c, err := app.FindCollectionByNameOrId("trees"); err == nil {
			return app.Delete(c)
		}
		return nil
	})
}
