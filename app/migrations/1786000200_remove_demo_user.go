package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// The upstream workavera seed adds a "Demo User"; the platform only knows
// roster members.
func init() {
	m.Register(func(app core.App) error {
		if u, err := app.FindRecordById(usersCollectionName, demoUserID); err == nil {
			return app.Delete(u)
		}
		return nil
	}, nil)
}
