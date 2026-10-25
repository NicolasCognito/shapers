package team

import (
	"encoding/json"
	"math"
	"slices"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Organisation-wide settings, changed by admins in the app (Settings →
// Organisation) and stored in the configs collection. Not per admin.
const settingMeetingHours = "team.meeting_hours" // attending a meeting logs its duration as hours

func settingBool(app core.App, key string) bool {
	r, err := app.FindFirstRecordByFilter("configs", "key = {:k}", dbx.Params{"k": key})
	if err != nil {
		return false
	}
	var v bool
	_ = json.Unmarshal([]byte(r.GetString("value")), &v)
	return v
}

func setSetting(app core.App, key string, value any, description string) error {
	r, err := app.FindFirstRecordByFilter("configs", "key = {:k}", dbx.Params{"k": key})
	if err != nil {
		col, cerr := app.FindCollectionByNameOrId("configs")
		if cerr != nil {
			return cerr
		}
		r = core.NewRecord(col)
		r.Set("key", key)
		r.Set("description", description)
	}
	r.Set("value", value)
	return app.Save(r)
}

// GET /api/team/settings
func handleGetSettings(e *core.RequestEvent) error {
	return e.JSON(200, map[string]any{"meeting_hours": settingBool(e.App, settingMeetingHours)})
}

// POST /api/team/settings {"meeting_hours": true}
func handleSetSettings(e *core.RequestEvent) error {
	var in struct {
		MeetingHours *bool `json:"meeting_hours"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	if in.MeetingHours != nil {
		if err := setSetting(e.App, settingMeetingHours, *in.MeetingHours,
			"Attending a meeting (present or remote) logs its duration as hours."); err != nil {
			return e.BadRequestError(err.Error(), err)
		}
	}
	return handleGetSettings(e)
}

// syncMeetingHours keeps one hour entry per member and meeting in line with
// the attendance: present/remote → the meeting's duration, anything else →
// no entry. Only when the organisation setting is on; existing entries stay
// if it is turned off later.
func syncMeetingHours(app core.App, meetingID, userID, state string) error {
	if !settingBool(app, settingMeetingHours) {
		return nil
	}
	existing, _ := app.FindFirstRecordByFilter(colHours, "user = {:u} && meeting = {:m} && source = 'meeting'",
		dbx.Params{"u": userID, "m": meetingID})
	if !slices.Contains([]string{"present", "remote"}, state) {
		if existing != nil {
			return app.Delete(existing)
		}
		return nil
	}
	m, err := app.FindRecordById(colMeetings, meetingID)
	if err != nil {
		return err
	}
	start, end := m.GetDateTime("start_at").Time(), m.GetDateTime("end_at").Time()
	hours := math.Round(end.Sub(start).Hours()*4) / 4 // quarter hours
	hours = math.Min(math.Max(hours, 0.25), 12)
	rec := existing
	if rec == nil {
		col, err := app.FindCollectionByNameOrId(colHours)
		if err != nil {
			return err
		}
		rec = core.NewRecord(col)
		rec.Set("user", userID)
		rec.Set("meeting", meetingID)
		rec.Set("source", "meeting")
	}
	rec.Set("date", start)
	rec.Set("hours", hours)
	rec.Set("note", "Meeting: "+m.GetString("title"))
	rec.Set("project", m.GetString("series"))
	return app.Save(rec)
}
