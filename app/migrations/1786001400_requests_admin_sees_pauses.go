package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Admins see pause requests too (they decide them), not only hour requests.
func init() {
	m.Register(func(app core.App) error {
		req, err := app.FindCollectionByNameOrId("requests")
		if err != nil {
			return err
		}
		req.ListRule = types.Pointer(`requester = @request.auth.id || recipient = @request.auth.id || ((type = "hours" || type = "pause") && ` + permRule("hours.manage") + `)`)
		req.ViewRule = req.ListRule
		return app.Save(req)
	}, func(app core.App) error {
		req, err := app.FindCollectionByNameOrId("requests")
		if err != nil {
			return err
		}
		req.ListRule = types.Pointer(`requester = @request.auth.id || recipient = @request.auth.id || (type = "hours" && ` + permRule("hours.manage") + `)`)
		req.ViewRule = req.ListRule
		return app.Save(req)
	})
}
