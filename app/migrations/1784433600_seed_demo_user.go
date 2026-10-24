package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Do not delete the demo user or this seed. The migration tests build on it:
// TestSeedDemoUser checks it exists, and TestBackfillConversationLastMessageAt
// uses it as the owner of test conversations. Removing it breaks both.
// It has no tier, so team analytics, Team page and Jarvis ignore it.
// On a public server, change its password or delete it there by hand —
// never via a migration.
const (
	demoUserID       = "workaverademo01"
	demoUserEmail    = "demo@workavera.local"
	demoUserPassword = "workavera"
	demoUserName     = "Demo User"
)

func init() {
	m.Register(seedDemoUser, removeDemoUser)
}

func seedDemoUser(app core.App) error {
	count, err := app.CountRecords(usersCollectionName)
	if err != nil {
		return err
	}
	if count != 0 {
		return nil
	}

	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	record := core.NewRecord(users)
	record.Id = demoUserID
	record.SetEmail(demoUserEmail)
	record.SetPassword(demoUserPassword)
	record.SetVerified(true)
	record.SetEmailVisibility(true)
	record.Set("name", demoUserName)

	return app.Save(record)
}

func removeDemoUser(app core.App) error {
	record, err := app.FindRecordById(usersCollectionName, demoUserID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if record.Email() != demoUserEmail {
		return nil
	}

	return app.Delete(record)
}
