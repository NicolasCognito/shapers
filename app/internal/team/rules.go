package team

// Tier rules from the organisers (email "članski nivoji", 24 Oct 2026):
//
//   - Pause: weeks on pause never count as behind and never break a streak.
//     Impact may pause up to 6 weeks a year, announced in advance; GO! only
//     briefly, with a reason for their buddy. Admins can set a pause directly.
//   - Community meetings: GO! must attend in person; Impact may miss 3 a year,
//     never two in a row.
//   - Absence notice (GO!): Community 72 h ahead, project meetings 24 h ahead.
//     A late notice counts as unexcused.
//   - Each missed Community meeting gives a GO! member a follow-up task due in
//     14 days: read the minutes and take a general task.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/xusenlin/workavera/internal/board"
)

const (
	colPauses             = "pauses"
	seriesCommunity       = "Community"
	tierGO                = "GO!"
	tierImpact            = "Impact"
	impactPauseDays       = 42 // 6 weeks a year
	impactCommunityMisses = 3  // per year
	followUpDays          = 14
	generalProjectName    = "General"
)

// ---------- pauses ----------

type pausePeriod struct {
	ID    string    `json:"id"`
	Start time.Time `json:"start"` // first day, 00:00 organisation time
	End   time.Time `json:"end"`   // last day (inclusive), 00:00
	Note  string    `json:"note"`
}

func dayOf(t time.Time) time.Time {
	t = t.In(Location)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, Location)
}

// noonUTC stores a calendar day the way the rest of the app does (12:00 local).
func noonUTC(day time.Time) string { return dbTime(dayOf(day).Add(12 * time.Hour)) }

func (p pausePeriod) until() time.Time { return p.End.AddDate(0, 0, 1) }
func (p pausePeriod) covers(t time.Time) bool {
	return !t.Before(p.Start) && t.Before(p.until())
}
func (p pausePeriod) overlaps(from, to time.Time) bool {
	return p.Start.Before(to) && from.Before(p.until())
}

// daysIn counts the pause's days that fall in the given year.
func (p pausePeriod) daysIn(year int) int {
	from := time.Date(year, 1, 1, 0, 0, 0, 0, Location)
	to := from.AddDate(1, 0, 0)
	s, e := p.Start, p.until()
	if s.Before(from) {
		s = from
	}
	if e.After(to) {
		e = to
	}
	if !s.Before(e) {
		return 0
	}
	return int(e.Sub(s).Hours()/24 + 0.5)
}

func pauseOf(r *core.Record) pausePeriod {
	return pausePeriod{
		ID: r.Id, Start: dayOf(r.GetDateTime("start_date").Time()),
		End: dayOf(r.GetDateTime("end_date").Time()), Note: r.GetString("note"),
	}
}

// loadPauses returns pauses per user (all users when userID is empty).
func loadPauses(app core.App, userID string) map[string][]pausePeriod {
	filter := ""
	if userID != "" {
		filter = "user = {:u}"
	}
	recs, err := app.FindRecordsByFilter(colPauses, filter, "start_date", 0, 0, dbx.Params{"u": userID})
	out := map[string][]pausePeriod{}
	if err != nil {
		return out
	}
	for _, r := range recs {
		out[r.GetString("user")] = append(out[r.GetString("user")], pauseOf(r))
	}
	return out
}

func inPause(ps []pausePeriod, t time.Time) bool {
	for _, p := range ps {
		if p.covers(t) {
			return true
		}
	}
	return false
}

func weekPaused(ps []pausePeriod, weekStart time.Time) bool {
	for _, p := range ps {
		if p.overlaps(weekStart, weekStart.AddDate(0, 0, 7)) {
			return true
		}
	}
	return false
}

// currentOrNextPause is the pause running today, or else the next one.
func currentOrNextPause(ps []pausePeriod, now time.Time) *pausePeriod {
	today := dayOf(now)
	for _, p := range ps {
		if !p.End.Before(today) {
			return &p
		}
	}
	return nil
}

func checkPause(u *core.Record, existing []pausePeriod, start, end time.Time, note string, byAdmin bool) error {
	switch {
	case end.Before(start):
		return errors.New("the pause must end on or after its first day")
	case end.Sub(start) > 183*24*time.Hour:
		return errors.New("a pause can last at most six months")
	}
	for _, p := range existing {
		if p.overlaps(start, end.AddDate(0, 0, 1)) {
			return fmt.Errorf("this overlaps a pause already set (%s – %s)", p.Start.Format("2 Jan"), p.End.Format("2 Jan"))
		}
	}
	if byAdmin {
		return nil
	}
	tier := u.GetString("tier")
	if strings.TrimSpace(note) == "" {
		if tier == tierGO {
			return errors.New("explain why you need the pause; your buddy and the admins will see it")
		}
		return errors.New("say why you need the pause")
	}
	today := dayOf(time.Now())
	if start.Before(today) {
		return errors.New("a pause can't start in the past; ask an admin to set it")
	}
	if tier == tierImpact {
		if !start.After(today) {
			return errors.New("Impact members announce a pause in advance: tomorrow at the earliest")
		}
		for y := start.Year(); y <= end.Year(); y++ {
			used := 0
			for _, p := range existing {
				used += p.daysIn(y)
			}
			want := pausePeriod{Start: start, End: end}.daysIn(y)
			if used+want > impactPauseDays {
				return fmt.Errorf("Impact members can pause up to 6 weeks a year; %d days left in %d", max(0, impactPauseDays-used), y)
			}
		}
	}
	return nil
}

func parseDay(s string) (time.Time, error) {
	d, err := time.ParseInLocation("2006-01-02", s, Location)
	if err != nil {
		return time.Time{}, errors.New("dates must be YYYY-MM-DD")
	}
	return d, nil
}

// RequestPause: a member asks the admins for a pause.
func RequestPause(app core.App, actor *core.Record, start, end time.Time, note string) (*core.Record, error) {
	if err := checkPause(actor, loadPauses(app, actor.Id)[actor.Id], start, end, note, false); err != nil {
		return nil, err
	}
	r, err := newRequest(app, "pause", actor.Id)
	if err != nil {
		return nil, err
	}
	r.Set("date", noonUTC(start))
	r.Set("end_date", noonUTC(end))
	r.Set("note", strings.TrimSpace(note))
	return r, app.Save(r)
}

// SetPause (admins): put a member on pause directly, or on approving a request.
func SetPause(app core.App, actorID, userID string, start, end time.Time, note string) (*core.Record, error) {
	u, err := findUser(app, userID)
	if err != nil {
		return nil, errors.New("member not found")
	}
	if err := checkPause(u, loadPauses(app, userID)[userID], start, end, note, true); err != nil {
		return nil, err
	}
	col, err := app.FindCollectionByNameOrId(colPauses)
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Set("user", userID)
	r.Set("start_date", noonUTC(start))
	r.Set("end_date", noonUTC(end))
	r.Set("note", strings.TrimSpace(note))
	r.Set("created_by", actorID)
	return r, app.Save(r)
}

// ---------- Community rules ----------

type communityStats struct {
	Rule        string `json:"rule"` // "in_person" (GO!), "limit" (Impact), "" (no rule)
	Held        int    `json:"held"` // this year, pauses excluded
	Missed      int    `json:"missed"`
	Remote      int    `json:"remote"`
	Limit       int    `json:"limit,omitempty"`
	InARow      bool   `json:"in_a_row"`
	LateNotices int    `json:"late_notices"`
	Breach      bool   `json:"breach"`
}

func (ds *dataset) community(u *core.Record, now time.Time) *communityStats {
	c := &communityStats{}
	switch u.GetString("tier") {
	case tierGO:
		c.Rule = "in_person"
	case tierImpact:
		c.Rule, c.Limit = "limit", impactCommunityMisses
	}
	prevMissed := false
	for _, m := range ds.meetings { // sorted by start
		start := m.GetDateTime("start_at").Time()
		if m.GetString("series") != seriesCommunity || !start.Before(now) || start.In(Location).Year() != now.In(Location).Year() {
			continue
		}
		if !containsID(m.GetStringSlice("members"), u.Id) || inPause(ds.pauses[u.Id], start) {
			continue
		}
		key := m.Id + "|" + u.Id
		c.Held++
		st := ds.attendance[key]
		missed := st == "excused" || st == "unexcused"
		if missed {
			c.Missed++
			if prevMissed {
				c.InARow = true
			}
		}
		if st == "remote" {
			c.Remote++
		}
		if ds.late[key] {
			c.LateNotices++
		}
		prevMissed = missed
	}
	if c.Held == 0 {
		return nil
	}
	switch c.Rule {
	case "in_person":
		c.Breach = c.Missed > 0 || c.LateNotices > 0
	case "limit":
		c.Breach = c.Missed > c.Limit || c.InARow
	}
	return c
}

func containsID(ids []string, id string) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

// ---------- absence notice ----------

// noticeHours is how far ahead a member must say they can't come (0 = no rule).
func noticeHours(tier, series string) int {
	if tier != tierGO {
		return 0
	}
	if series == seriesCommunity {
		return 72
	}
	return 24
}

// NoticeAbsence: a member says before a meeting that they can't come. On time
// it counts as excused; a late notice (GO! rules) counts as unexcused.
func NoticeAbsence(app core.App, u *core.Record, meetingID, reason string) (*core.Record, error) {
	m, err := app.FindRecordById(colMeetings, meetingID)
	if err != nil {
		return nil, errors.New("meeting not found")
	}
	if !containsID(m.GetStringSlice("members"), u.Id) {
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
	rec, err := app.FindFirstRecordByFilter(colAttendance, "meeting = {:m} && user = {:u}", dbx.Params{"m": m.Id, "u": u.Id})
	if err != nil {
		col, cerr := app.FindCollectionByNameOrId(colAttendance)
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
	rec.Set("notice_at", dbTime(time.Now()))
	rec.Set("notice_late", late)
	if err := app.Save(rec); err != nil {
		return nil, err
	}
	go slackAbsenceNotice(u, m, reason, late, need)
	return rec, nil
}

// WithdrawNotice: the member can make it after all (before the meeting starts).
func WithdrawNotice(app core.App, u *core.Record, meetingID string) error {
	m, err := app.FindRecordById(colMeetings, meetingID)
	if err != nil {
		return errors.New("meeting not found")
	}
	if !time.Now().Before(m.GetDateTime("start_at").Time()) {
		return errors.New("the meeting has already started")
	}
	rec, err := app.FindFirstRecordByFilter(colAttendance, "meeting = {:m} && user = {:u} && source = 'notice'", dbx.Params{"m": m.Id, "u": u.Id})
	if err != nil {
		return errors.New("no absence notice for this meeting")
	}
	return app.Delete(rec)
}

func slackAbsenceNotice(u, m *core.Record, reason string, late bool, need int) {
	if slack == nil {
		return
	}
	ch, err := slack.channel()
	if err != nil {
		return
	}
	who := "*" + u.GetString("name") + "*"
	if id := u.GetString("slack_id"); id != "" {
		who = "<@" + id + ">"
	}
	text := fmt.Sprintf("🙋 %s can't make it to *%s* · %s (%s)\n> %s", who, m.GetString("series"), m.GetString("title"),
		meetingWhen(m.GetDateTime("start_at").Time()), reason)
	if late {
		text += fmt.Sprintf("\n_Short notice: GO! members let the team know %d h ahead._", need)
	}
	if err := slack.call("chat.postMessage", url.Values{"channel": {ch}, "text": {text}}, nil); err != nil {
		slog.Warn("slack: absence notice", "error", err)
	}
}

// ---------- GO! follow-up task for a missed Community meeting ----------

func registerTierRules(app core.App) {
	sync := func(e *core.RecordEvent) error {
		syncFollowUp(e.App, e.Record)
		return e.Next()
	}
	app.OnRecordAfterCreateSuccess(colAttendance).BindFunc(sync)
	app.OnRecordAfterUpdateSuccess(colAttendance).BindFunc(sync)
	app.OnRecordAfterDeleteSuccess(colAttendance).BindFunc(func(e *core.RecordEvent) error {
		if id := e.Record.GetString("follow_up_task"); id != "" {
			removeOpenTask(e.App, id)
		}
		return e.Next()
	})
}

func syncFollowUp(app core.App, a *core.Record) {
	st := a.GetString("state")
	missed := st == "excused" || st == "unexcused"
	taskID := a.GetString("follow_up_task")
	if !missed {
		if taskID != "" { // they came after all
			removeOpenTask(app, taskID)
			a.Set("follow_up_task", "")
			_ = app.Save(a)
		}
		return
	}
	if taskID != "" || a.GetString("source") == "import" {
		return
	}
	u, err := findUser(app, a.GetString("user"))
	if err != nil || u.GetString("tier") != tierGO {
		return
	}
	m, err := app.FindRecordById(colMeetings, a.GetString("meeting"))
	if err != nil || m.GetString("series") != seriesCommunity {
		return
	}
	start := m.GetDateTime("start_at").Time()
	if inPause(loadPauses(app, u.Id)[u.Id], start) {
		return
	}
	id, err := createFollowUpTask(app, u, m)
	if err != nil {
		slog.Warn("team: follow-up task", "error", err)
		return
	}
	a.Set("follow_up_task", id)
	_ = app.Save(a)
}

func removeOpenTask(app core.App, id string) {
	t, err := app.FindRecordById("board_tasks", id)
	if err != nil || isCompleted(app, t) {
		return
	}
	_ = app.Delete(t)
}

// generalProject finds or creates the project for everyday institute work.
func generalProject(app core.App) (*core.Record, error) {
	if p, err := app.FindFirstRecordByFilter("board_projects", "name = {:n}", dbx.Params{"n": generalProjectName}); err == nil {
		return p, nil
	}
	admin, err := app.FindFirstRecordByFilter(colUsers, "is_admin = true && tier != ''")
	if err != nil {
		return nil, fmt.Errorf("no admin to own the %s project: %w", generalProjectName, err)
	}
	res, err := board.CreateProject(context.Background(), app, admin.Id, board.CreateProjectCommand{
		Name: generalProjectName, Description: "Everyday institute work, and follow-ups from missed Community meetings",
		States: []board.TemplateState{
			{Name: "To do", Color: "#94a3b8", Category: "pending"},
			{Name: "In progress", Color: "#3b82f6", Category: "active"},
			{Name: "Done", Color: "#22c55e", Category: "completed"},
		},
	})
	if err != nil {
		return nil, err
	}
	p, err := app.FindRecordById("board_projects", res.ID)
	if err != nil {
		return nil, err
	}
	return p, addEveryoneToProject(app, p)
}

func createFollowUpTask(app core.App, u, m *core.Record) (string, error) {
	p, err := generalProject(app)
	if err != nil {
		return "", err
	}
	if err := ensureMember(app, p.Id, p.GetString("owner"), u); err != nil {
		return "", err
	}
	st, err := app.FindFirstRecordByFilter("board_project_states", "project = {:p} && category = 'pending'", dbx.Params{"p": p.Id})
	if err != nil {
		return "", errors.New("General project has no to-do state")
	}
	start := m.GetDateTime("start_at").Time().In(Location)
	res, err := board.CreateTask(context.Background(), app, p.GetString("owner"), board.CreateTaskCommand{
		ProjectID: p.Id, StateID: st.Id, Priority: "medium",
		Title: fmt.Sprintf("Community follow-up (%s): read the minutes and take a general task", start.Format("2 Jan")),
		Description: fmt.Sprintf("You missed %s · %s on %s. GO! rule: within %d days read the minutes and take on one general task.",
			m.GetString("series"), m.GetString("title"), start.Format("Mon 2 Jan"), followUpDays),
		DueDate:     noonUTC(start.AddDate(0, 0, followUpDays)),
		AssigneeIDs: []string{u.Id},
	})
	if err != nil {
		return "", err
	}
	return res.ID, nil
}

// CheckIn clocks the user in to a meeting (same rules as the check-in button).
func CheckIn(app core.App, userID, meetingID string, remote bool) (*core.Record, error) {
	m, err := app.FindRecordById(colMeetings, meetingID)
	if err != nil {
		return nil, errors.New("meeting not found")
	}
	if !containsID(m.GetStringSlice("members"), userID) {
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

// ---------- HTTP ----------

func registerRuleRoutes(se *core.ServeEvent) {
	g := se.Router.Group("/api/team")
	g.Bind(apis.RequireAuth(colUsers))
	type span struct {
		Start string `json:"start"`
		End   string `json:"end"`
		Note  string `json:"note"`
	}
	parseSpan := func(e *core.RequestEvent) (time.Time, time.Time, string, error) {
		var in span
		if err := e.BindBody(&in); err != nil {
			return time.Time{}, time.Time{}, "", errors.New("invalid body")
		}
		s, err := parseDay(in.Start)
		if err != nil {
			return s, s, "", err
		}
		end, err := parseDay(in.End)
		return s, end, in.Note, err
	}
	g.POST("/requests/pause", func(e *core.RequestEvent) error {
		s, end, note, err := parseSpan(e)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		rec, err := RequestPause(e.App, e.Auth, s, end, note)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, rec)
	})
	g.POST("/members/{id}/pauses", requirePerm(PermMembersManage, func(e *core.RequestEvent) error {
		s, end, note, err := parseSpan(e)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		rec, err := SetPause(e.App, e.Auth.Id, e.Request.PathValue("id"), s, end, note)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, rec)
	}))
	g.DELETE("/pauses/{id}", requirePerm(PermMembersManage, func(e *core.RequestEvent) error {
		r, err := e.App.FindRecordById(colPauses, e.Request.PathValue("id"))
		if err != nil {
			return e.NotFoundError("Pause not found.", nil)
		}
		if err := e.App.Delete(r); err != nil {
			return e.InternalServerError("", err)
		}
		return e.JSON(200, map[string]any{"ok": true})
	}))
	g.POST("/absence", func(e *core.RequestEvent) error {
		var in struct {
			Meeting string `json:"meeting"`
			Reason  string `json:"reason"`
		}
		if err := e.BindBody(&in); err != nil {
			return e.BadRequestError("Invalid body.", err)
		}
		rec, err := NoticeAbsence(e.App, e.Auth, in.Meeting, in.Reason)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, rec)
	})
	g.DELETE("/absence/{meeting}", func(e *core.RequestEvent) error {
		if err := WithdrawNotice(e.App, e.Auth, e.Request.PathValue("meeting")); err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, map[string]any{"ok": true})
	})
}
