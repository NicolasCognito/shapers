package migrations

import (
	"slices"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Tier rules from the organisers:
//   - pauses: weeks on pause don't count as behind and don't break streaks
//     (members ask through a "pause" request, admins can set one directly);
//   - absence notices: a member says ahead of time they can't come, with a reason;
//   - GO! members get a follow-up task for each missed Community meeting.
func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId(usersCollectionName)
		if err != nil {
			return err
		}
		p := core.NewBaseCollection("pauses")
		p.Fields.Add(
			&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
			&core.DateField{Name: "start_date", Required: true},
			&core.DateField{Name: "end_date", Required: true},
			&core.TextField{Name: "note", Max: 500},
			&core.RelationField{Name: "created_by", CollectionId: users.Id, MaxSelect: 1},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		p.AddIndex("idx_pauses_user", false, "user, start_date", "")
		if err := app.Save(p); err != nil {
			return err
		}

		req, err := app.FindCollectionByNameOrId("requests")
		if err != nil {
			return err
		}
		if f, ok := req.Fields.GetByName("type").(*core.SelectField); ok {
			f.Values = []string{"hours", "handoff", "pause"}
		}
		req.Fields.Add(&core.DateField{Name: "end_date"})
		if err := app.Save(req); err != nil {
			return err
		}

		att, err := app.FindCollectionByNameOrId("attendance")
		if err != nil {
			return err
		}
		att.Fields.Add(
			&core.TextField{Name: "note", Max: 500},
			&core.DateField{Name: "notice_at"},
			&core.BoolField{Name: "notice_late"},
			&core.TextField{Name: "follow_up_task", Max: 40},
		)
		if f, ok := att.Fields.GetByName("source").(*core.SelectField); ok && !slices.Contains(f.Values, "notice") {
			f.Values = append(f.Values, "notice")
		}
		return app.Save(att)
	}, func(app core.App) error {
		if c, err := app.FindCollectionByNameOrId("pauses"); err == nil {
			if err := app.Delete(c); err != nil {
				return err
			}
		}
		if req, err := app.FindCollectionByNameOrId("requests"); err == nil {
			req.Fields.RemoveByName("end_date")
			if f, ok := req.Fields.GetByName("type").(*core.SelectField); ok {
				f.Values = []string{"hours", "handoff"}
			}
			if err := app.Save(req); err != nil {
				return err
			}
		}
		if att, err := app.FindCollectionByNameOrId("attendance"); err == nil {
			for _, n := range []string{"note", "notice_at", "notice_late", "follow_up_task"} {
				att.Fields.RemoveByName(n)
			}
			return app.Save(att)
		}
		return nil
	})
}

