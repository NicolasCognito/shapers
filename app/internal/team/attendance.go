package team

import (
	"errors"
	"slices"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

const (
	checkinEarly = 30 * time.Minute // clock-in opens before start
	checkinLate  = 30 * time.Minute // and closes after end
)

var validStates = map[string]bool{"present": true, "remote": true, "excused": true, "unexcused": true}

func upsertAttendance(app core.App, meetingID, userID, state, source, recordedBy string) (*core.Record, error) {
	rec, err := app.FindFirstRecordByFilter(org.ColAttendance, "meeting = {:m} && user = {:u}", dbx.Params{"m": meetingID, "u": userID})
	if err != nil {
		col, cerr := app.FindCollectionByNameOrId(org.ColAttendance)
		if cerr != nil {
			return nil, cerr
		}
		rec = core.NewRecord(col)
		rec.Set("meeting", meetingID)
		rec.Set("user", userID)
	}
	rec.Set("state", state)
	rec.Set("source", source)
	rec.Set("recorded_by", recordedBy)
	if err := app.Save(rec); err != nil {
		return rec, err
	}
	return rec, syncMeetingHours(app, meetingID, userID, state)
}

// CheckIn clocks the user in to a meeting (same rules as the check-in button).
func CheckIn(app core.App, userID, meetingID string, remote bool) (*core.Record, error) {
	m, err := app.FindRecordById(org.ColMeetings, meetingID)
	if err != nil {
		return nil, errors.New("meeting not found")
	}
	if !slices.Contains(m.GetStringSlice("members"), userID) {
		return nil, errors.New("you are not a member of this meeting series")
	}
	now := time.Now()
	start, end := m.GetDateTime("start_at").Time(), m.GetDateTime("end_at").Time()
	if now.Before(start.Add(-checkinEarly)) || now.After(end.Add(checkinLate)) {
		return nil, errors.New("clock-in is open from 30 min before the meeting until 30 min after it ends")
	}
	state := "present"
	if remote {
		state = "remote"
	}
	return upsertAttendance(app, m.Id, userID, state, "self", userID)
}

// POST /api/team/checkin {"meeting": "...", "remote": false}
func handleCheckin(e *core.RequestEvent) error {
	var body struct {
		Meeting string `json:"meeting"`
		Remote  bool   `json:"remote"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	rec, err := CheckIn(e.App, e.Auth.Id, body.Meeting, body.Remote)
	return replyRecord(e, rec, err)
}

// POST /api/team/attendance/bulk {"meeting": "...", "entries": [{"user": "...", "state": "present"}]}
func handleBulkAttendance(e *core.RequestEvent) error {
	var body struct {
		Meeting string `json:"meeting"`
		Entries []struct {
			User  string `json:"user"`
			State string `json:"state"`
		} `json:"entries"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	if _, err := e.App.FindRecordById(org.ColMeetings, body.Meeting); err != nil {
		return e.NotFoundError("Meeting not found.", err)
	}
	saved := 0
	err := e.App.RunInTransaction(func(tx core.App) error {
		for _, en := range body.Entries {
			if !validStates[en.State] {
				continue
			}
			if _, err := upsertAttendance(tx, body.Meeting, en.User, en.State, "admin", e.Auth.Id); err != nil {
				return err
			}
			saved++
		}
		return nil
	})
	if err != nil {
		return e.InternalServerError("Could not save attendance.", err)
	}
	return e.JSON(200, map[string]any{"saved": saved})
}
