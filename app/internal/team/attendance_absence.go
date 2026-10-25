package team

import (
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
	"github.com/xusenlin/workavera/internal/slack"
)

// noticeHours is how far ahead a member must say they can't come (0 = no rule).
func noticeHours(tier, series string) int {
	if tier != org.TierGO {
		return 0
	}
	if series == org.SeriesCommunity {
		return 72
	}
	return 24
}

// NoticeAbsence: a member says before a meeting that they can't come. On time
// it counts as excused; a late notice (GO! rules) counts as unexcused.
func NoticeAbsence(app core.App, u *core.Record, meetingID, reason string) (*core.Record, error) {
	m, err := app.FindRecordById(org.ColMeetings, meetingID)
	if err != nil {
		return nil, errors.New("meeting not found")
	}
	if !slices.Contains(m.GetStringSlice("members"), u.Id) {
		return nil, errors.New("you are not a member of this meeting series")
	}
	start := m.GetDateTime("start_at").Time()
	if !time.Now().Before(start) {
		return nil, errors.New("the meeting has already started; ask an admin to record your absence")
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return nil, errors.New("say why you can't come")
	}
	need := noticeHours(u.GetString("tier"), m.GetString("series"))
	late := need > 0 && time.Until(start) < time.Duration(need)*time.Hour
	state := "excused"
	if late {
		state = "unexcused"
	}
	rec, err := app.FindFirstRecordByFilter(org.ColAttendance, "meeting = {:m} && user = {:u}", dbx.Params{"m": m.Id, "u": u.Id})
	if err != nil {
		col, cerr := app.FindCollectionByNameOrId(org.ColAttendance)
		if cerr != nil {
			return nil, cerr
		}
		rec = core.NewRecord(col)
		rec.Set("meeting", m.Id)
		rec.Set("user", u.Id)
	}
	rec.Set("state", state)
	rec.Set("source", "notice")
	rec.Set("recorded_by", u.Id)
	rec.Set("note", reason)
	rec.Set("notice_at", org.DBTime(time.Now()))
	rec.Set("notice_late", late)
	if err := app.Save(rec); err != nil {
		return nil, err
	}
	go slack.AbsenceNotice(u, m, reason, late, need)
	return rec, nil
}

// WithdrawNotice: the member can make it after all (before the meeting starts).
func WithdrawNotice(app core.App, u *core.Record, meetingID string) error {
	m, err := app.FindRecordById(org.ColMeetings, meetingID)
	if err != nil {
		return errors.New("meeting not found")
	}
	if !time.Now().Before(m.GetDateTime("start_at").Time()) {
		return errors.New("the meeting has already started")
	}
	rec, err := app.FindFirstRecordByFilter(org.ColAttendance, "meeting = {:m} && user = {:u} && source = 'notice'", dbx.Params{"m": m.Id, "u": u.Id})
	if err != nil {
		return errors.New("no absence notice for this meeting")
	}
	return app.Delete(rec)
}

// POST /api/team/absence {"meeting": "...", "reason": "..."}
func handleAbsence(e *core.RequestEvent) error {
	var in struct {
		Meeting string `json:"meeting"`
		Reason  string `json:"reason"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	rec, err := NoticeAbsence(e.App, e.Auth, in.Meeting, in.Reason)
	return replyRecord(e, rec, err)
}

// DELETE /api/team/absence/{meeting}
func handleWithdrawAbsence(e *core.RequestEvent) error {
	if err := WithdrawNotice(e.App, e.Auth, e.Request.PathValue("meeting")); err != nil {
		return e.BadRequestError(err.Error(), nil)
	}
	return e.JSON(200, map[string]any{"ok": true})
}
