package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Admins may edit any project's settings, columns, labels and members, not
// only its owner (all sandbox projects belong to one admin). Archiving and
// ownership transfer stay owner-only.
func init() {
	const admin = ` || @request.auth.is_admin = true`
	m.Register(func(app core.App) error {
		widen := func(r *string) *string {
			if r == nil {
				return nil
			}
			return types.Pointer("(" + *r + ")" + admin)
		}
		p, err := app.FindCollectionByNameOrId("board_projects")
		if err != nil {
			return err
		}
		p.UpdateRule = widen(p.UpdateRule)
		if err := app.Save(p); err != nil {
			return err
		}
		for _, name := range []string{"board_project_states", "board_project_labels", "board_project_members"} {
			c, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			c.CreateRule, c.UpdateRule, c.DeleteRule = widen(c.CreateRule), widen(c.UpdateRule), widen(c.DeleteRule)
			if err := app.Save(c); err != nil {
				return err
			}
		}
		return nil
	}, nil)
}
