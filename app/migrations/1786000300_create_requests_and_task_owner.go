package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Requests: one inbox for things that need someone else's yes.
//   - hours:   a member asks admins to log hours for a date older than yesterday
//   - handoff: a task owner asks another member to take the task over
//
// Tasks get an owner (the person responsible, defaults to the creator) and a
// "cancelled" mark admins put on finished tasks that should not count.
// All of these change only through /api/team endpoints, never the record API.
func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId(usersCollectionName)
		if err != nil {
			return err
		}
		tasks, err := app.FindCollectionByNameOrId("board_tasks")
		if err != nil {
			return err
		}

		tasks.Fields.Add(
			&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1},
			&core.BoolField{Name: "cancelled"},
			&core.TextField{Name: "cancel_reason", Max: 500},
			&core.RelationField{Name: "cancelled_by", CollectionId: users.Id, MaxSelect: 1},
		)
		locked := ` && @request.body.owner:changed = false && @request.body.handoff_to:changed = false` +
			` && @request.body.cancelled:changed = false && @request.body.cancel_reason:changed = false` +
			` && @request.body.cancelled_by:changed = false && (cancelled = false || @request.body.state:changed = false)`
		if tasks.UpdateRule != nil {
			tasks.UpdateRule = types.Pointer(*tasks.UpdateRule + locked)
		}
		if tasks.CreateRule != nil {
			tasks.CreateRule = types.Pointer(*tasks.CreateRule +
				` && @request.body.owner:isset = false && @request.body.handoff_to:isset = false && @request.body.cancelled:isset = false`)
		}
		if err := app.Save(tasks); err != nil {
			return err
		}
		if _, err := app.DB().NewQuery("UPDATE board_tasks SET owner = created_by WHERE owner = '' OR owner IS NULL").Execute(); err != nil {
			return err
		}

		hours, err := app.FindCollectionByNameOrId("hour_logs")
		if err != nil {
			return err
		}
		if f, ok := hours.Fields.GetByName("source").(*core.SelectField); ok {
			f.Values = []string{"manual", "import", "agent", "request"}
		}
		if err := app.Save(hours); err != nil {
			return err
		}

		req := core.NewBaseCollection("requests")
		req.ListRule = types.Pointer(`requester = @request.auth.id || recipient = @request.auth.id || (type = "hours" && ` + permRule("hours.manage") + `)`)
		req.ViewRule = req.ListRule
		req.Fields.Add(
			&core.SelectField{Name: "type", Required: true, MaxSelect: 1, Values: []string{"hours", "handoff"}},
			&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"pending", "approved", "rejected", "withdrawn"}},
			&core.RelationField{Name: "requester", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
			&core.RelationField{Name: "recipient", CollectionId: users.Id, MaxSelect: 1},
			&core.RelationField{Name: "task", CollectionId: tasks.Id, MaxSelect: 1, CascadeDelete: true},
			&core.DateField{Name: "date"},
			&core.NumberField{Name: "hours"},
			&core.TextField{Name: "note", Max: 500},
			&core.TextField{Name: "decision_note", Max: 500},
			&core.RelationField{Name: "decided_by", CollectionId: users.Id, MaxSelect: 1},
			&core.DateField{Name: "decided_at"},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		req.AddIndex("idx_requests_status_type", false, "status, type", "")
		return app.Save(req)
	}, func(app core.App) error {
		if c, err := app.FindCollectionByNameOrId("requests"); err == nil {
			if err := app.Delete(c); err != nil {
				return err
			}
		}
		tasks, err := app.FindCollectionByNameOrId("board_tasks")
		if err != nil {
			return err
		}
		for _, f := range []string{"owner", "cancelled", "cancel_reason", "cancelled_by"} {
			tasks.Fields.RemoveByName(f)
		}
		return app.Save(tasks)
	})
}
