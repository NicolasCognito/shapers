package team

import (
	"math"
	"slices"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

// syncMeetingHours keeps one hour entry per member and meeting in line with
// the attendance: present/remote → the meeting's duration, anything else →
// no entry. Only when the organisation setting is on; existing entries stay
// if it is turned off later.
func syncMeetingHours(app core.App, meetingID, userID, state string) error {
	if !org.SettingBool(app, org.SettingMeetingHours) {
		return nil
	}
	existing, _ := app.FindFirstRecordByFilter(org.ColHourLogs, "user = {:u} && meeting = {:m} && source = 'meeting'",
		dbx.Params{"u": userID, "m": meetingID})
	if !slices.Contains([]string{"present", "remote"}, state) {
		if existing != nil {
			return app.Delete(existing)
		}
		return nil
	}
	m, err := app.FindRecordById(org.ColMeetings, meetingID)
	if err != nil {
		return err
	}
	start, end := m.GetDateTime("start_at").Time(), m.GetDateTime("end_at").Time()
	hours := math.Round(end.Sub(start).Hours()*4) / 4 // quarter hours
	hours = math.Min(math.Max(hours, 0.25), 12)
	rec := existing
	if rec == nil {
		col, err := app.FindCollectionByNameOrId(org.ColHourLogs)
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
