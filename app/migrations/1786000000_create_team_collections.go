package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Team coordination: member tiers, meetings read from Google Calendar,
// attendance and hour logs.

var (
	teamTiers  = []string{"Core", "Impact", "GO!"}
	teamSeries = []string{"Summer School", "Grants", "Shape Talks", "Community", "Shapers Tech", "Shapers Voice"}
	teamStates = []string{"present", "remote", "excused", "unexcused"}
)

const (
	teamAdminRule = `@request.auth.is_admin = true`
	teamAuthRule  = `@request.auth.id != ""`
)

func init() {
	m.Register(createTeamCollections, dropTeamCollections)
}

func createTeamCollections(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	users.Fields.Add(
		&core.SelectField{Name: "tier", MaxSelect: 1, Values: teamTiers},
		&core.NumberField{Name: "weekly_hours", Min: types.Pointer(0.0)},
		&core.BoolField{Name: "is_admin"},
		&core.SelectField{Name: "series", MaxSelect: len(teamSeries), Values: teamSeries},
	)
	// Members edit their own profile but never their tier, quota or role.
	users.UpdateRule = types.Pointer(`(id = @request.auth.id && @request.body.is_admin:changed = false && @request.body.tier:changed = false && @request.body.weekly_hours:changed = false) || ` + teamAdminRule)
	if err := app.Save(users); err != nil {
		return err
	}

	meetings := core.NewBaseCollection("meetings")
	meetings.ListRule = types.Pointer(teamAuthRule)
	meetings.ViewRule = types.Pointer(teamAuthRule)
	// Meetings stay in Google Calendar: only the server sync writes them.
	meetings.Fields.Add(
		&core.TextField{Name: "external_id", Required: true, Max: 300},
		&core.TextField{Name: "title", Required: true, Max: 240, Presentable: true},
		&core.SelectField{Name: "series", Required: true, MaxSelect: 1, Values: teamSeries},
		&core.DateField{Name: "start_at", Required: true},
		&core.DateField{Name: "end_at", Required: true},
		&core.TextField{Name: "location", Max: 500},
		&core.RelationField{Name: "members", CollectionId: users.Id, MaxSelect: 999},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	meetings.AddIndex("idx_meetings_external_id", true, "external_id", "")
	meetings.AddIndex("idx_meetings_start", false, "start_at", "")
	if err := app.Save(meetings); err != nil {
		return err
	}

	attendance := core.NewBaseCollection("attendance")
	ownOrAdmin := `user = @request.auth.id || ` + teamAdminRule
	attendance.ListRule = types.Pointer(ownOrAdmin)
	attendance.ViewRule = types.Pointer(ownOrAdmin)
	// Members clock in through POST /api/team/checkin (time-window checked);
	// admins record anything directly.
	attendance.CreateRule = types.Pointer(teamAdminRule)
	attendance.UpdateRule = types.Pointer(teamAdminRule)
	attendance.DeleteRule = types.Pointer(teamAdminRule)
	attendance.Fields.Add(
		&core.RelationField{Name: "meeting", CollectionId: meetings.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.SelectField{Name: "state", Required: true, MaxSelect: 1, Values: teamStates},
		&core.SelectField{Name: "source", MaxSelect: 1, Values: []string{"self", "admin", "import"}},
		&core.RelationField{Name: "recorded_by", CollectionId: users.Id, MaxSelect: 1},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	attendance.AddIndex("idx_attendance_meeting_user", true, "meeting, user", "")
	if err := app.Save(attendance); err != nil {
		return err
	}

	hours := core.NewBaseCollection("hour_logs")
	hours.ListRule = types.Pointer(ownOrAdmin)
	hours.ViewRule = types.Pointer(ownOrAdmin)
	hours.CreateRule = types.Pointer(`(@request.auth.id != "" && @request.body.user = @request.auth.id) || ` + teamAdminRule)
	hours.UpdateRule = types.Pointer(`(user = @request.auth.id && @request.body.user:changed = false) || ` + teamAdminRule)
	hours.DeleteRule = types.Pointer(ownOrAdmin)
	hours.Fields.Add(
		&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.DateField{Name: "date", Required: true},
		&core.NumberField{Name: "hours", Required: true, Min: types.Pointer(0.25), Max: types.Pointer(100.0)},
		&core.TextField{Name: "note", Max: 500},
		&core.TextField{Name: "project", Max: 100},
		&core.SelectField{Name: "source", MaxSelect: 1, Values: []string{"manual", "import", "agent"}},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	hours.AddIndex("idx_hour_logs_user_date", false, "user, date", "")
	return app.Save(hours)
}

func dropTeamCollections(app core.App) error {
	for _, name := range []string{"hour_logs", "attendance", "meetings"} {
		if c, err := app.FindCollectionByNameOrId(name); err == nil {
			if err := app.Delete(c); err != nil {
				return err
			}
		}
	}
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	for _, f := range []string{"tier", "weekly_hours", "is_admin", "series"} {
		users.Fields.RemoveByName(f)
	}
	users.UpdateRule = types.Pointer("id = @request.auth.id")
	return app.Save(users)
}
