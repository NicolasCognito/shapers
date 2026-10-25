package team

import (
	"slices"
	"sort"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	checkinEarly = 30 * time.Minute // clock-in opens before start
	checkinLate  = 30 * time.Minute // and closes after end
	historyWeeks = 6
)

var validStates = map[string]bool{"present": true, "remote": true, "excused": true, "unexcused": true}

func dbTime(t time.Time) string { return t.UTC().Format("2006-01-02 15:04:05.000Z") }

// ---------- attendance writes ----------

func upsertAttendance(app core.App, meetingID, userID, state, source, recordedBy string) (*core.Record, error) {
	rec, err := app.FindFirstRecordByFilter(colAttendance, "meeting = {:m} && user = {:u}", dbx.Params{"m": meetingID, "u": userID})
	if err != nil {
		col, cerr := app.FindCollectionByNameOrId(colAttendance)
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
	return rec, app.Save(rec)
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
	m, err := e.App.FindRecordById(colMeetings, body.Meeting)
	if err != nil {
		return e.NotFoundError("Meeting not found.", err)
	}
	if !slices.Contains(m.GetStringSlice("members"), e.Auth.Id) {
		return e.ForbiddenError("You are not a member of this meeting series.", nil)
	}
	now := time.Now()
	start, end := m.GetDateTime("start_at").Time(), m.GetDateTime("end_at").Time()
	if now.Before(start.Add(-checkinEarly)) || now.After(end.Add(checkinLate)) {
		return e.BadRequestError("Clock-in is open from 30 min before the meeting until 30 min after it ends.", nil)
	}
	state := "present"
	if body.Remote {
		state = "remote"
	}
	rec, err := upsertAttendance(e.App, m.Id, e.Auth.Id, state, "self", e.Auth.Id)
	if err != nil {
		return e.InternalServerError("Could not save attendance.", err)
	}
	return e.JSON(200, rec)
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
	if _, err := e.App.FindRecordById(colMeetings, body.Meeting); err != nil {
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

// ---------- read models ----------

type meetingView struct {
	ID       string    `json:"id"`
	Title    string    `json:"title"`
	Series   string    `json:"series"`
	Start    time.Time `json:"start"`
	End      time.Time `json:"end"`
	Location string    `json:"location"`
	State    string    `json:"state"` // my state, "" if not recorded
	CanCheck bool      `json:"can_check_in"`
	Notice   string    `json:"notice,omitempty"` // my "can't come" reason, sent ahead
	Late     bool      `json:"notice_late,omitempty"`
	Member   bool      `json:"member,omitempty"` // the viewer is in this meeting's list
}

type weekHours struct {
	WeekStart string  `json:"week_start"`
	Hours     float64 `json:"hours"`
	Quota     float64 `json:"quota"`
	Met       bool    `json:"met"`
	Paused    bool    `json:"paused"` // on pause: not behind, doesn't break the streak
}

type attendanceStats struct {
	Present   int     `json:"present"`
	Remote    int     `json:"remote"`
	Excused   int     `json:"excused"`
	Unexcused int     `json:"unexcused"`
	Unmarked  int     `json:"unmarked"`
	Rate      float64 `json:"rate"` // (present+remote) / meetings held
}

func (s *attendanceStats) add(state string) {
	switch state {
	case "present":
		s.Present++
	case "remote":
		s.Remote++
	case "excused":
		s.Excused++
	case "unexcused":
		s.Unexcused++
	default:
		s.Unmarked++
	}
}

func (s *attendanceStats) finish() {
	total := s.Present + s.Remote + s.Excused + s.Unexcused + s.Unmarked
	if total > 0 {
		s.Rate = float64(s.Present+s.Remote) / float64(total)
	}
}

// dataset is everything analytics needs, loaded once per request
// (20 members, ~60 meetings: in-memory is simplest and fast).
type dataset struct {
	users      []*core.Record
	meetings   []*core.Record
	attendance map[string]string             // meetingID|userID -> state
	hours      map[string]map[string]float64 // userID -> weekStart -> hours
	weeks      []time.Time                   // oldest .. current
	tasksDone  map[string]int                // userID -> completed tasks (all time)
	lastDone   map[string]string             // userID -> last completion time
	pauses     map[string][]pausePeriod      // userID -> pauses
	late       map[string]bool               // meetingID|userID -> absence noticed too late
	notice     map[string]string             // meetingID|userID -> "can't come" reason
}

func loadDataset(app core.App) (*dataset, error) {
	ds := &dataset{attendance: map[string]string{}, hours: map[string]map[string]float64{}, late: map[string]bool{}, notice: map[string]string{}}
	var err error
	// Only roster members (with a tier) count in analytics.
	if ds.users, err = app.FindRecordsByFilter(colUsers, "tier != ''", "", 0, 0); err != nil {
		return nil, err
	}
	sort.Slice(ds.users, func(i, j int) bool { return ds.users[i].GetString("name") < ds.users[j].GetString("name") })
	if ds.meetings, err = app.FindRecordsByFilter(colMeetings, "", "start_at", 0, 0); err != nil {
		return nil, err
	}
	att, err := app.FindAllRecords(colAttendance)
	if err != nil {
		return nil, err
	}
	for _, a := range att {
		key := a.GetString("meeting") + "|" + a.GetString("user")
		ds.attendance[key] = a.GetString("state")
		if a.GetBool("notice_late") {
			ds.late[key] = true
		}
		if a.GetString("source") == "notice" {
			ds.notice[key] = a.GetString("note")
		}
	}
	ds.pauses = loadPauses(app, "")
	cur := WeekStart(time.Now())
	for i := historyWeeks - 1; i >= 0; i-- {
		ds.weeks = append(ds.weeks, cur.AddDate(0, 0, -7*i))
	}
	logs, err := app.FindRecordsByFilter(colHours, "date >= {:d}", "", 0, 0, dbx.Params{"d": dbTime(ds.weeks[0])})
	if err != nil {
		return nil, err
	}
	for _, l := range logs {
		uid := l.GetString("user")
		if ds.hours[uid] == nil {
			ds.hours[uid] = map[string]float64{}
		}
		ds.hours[uid][WeekStart(l.GetDateTime("date").Time()).Format("2006-01-02")] += l.GetFloat("hours")
	}
	ds.tasksDone, ds.lastDone = completedTasks(app)
	return ds, nil
}

func (ds *dataset) weekHistory(u *core.Record) []weekHours {
	quota := u.GetFloat("weekly_hours")
	out := make([]weekHours, 0, len(ds.weeks))
	for _, w := range ds.weeks {
		k := w.Format("2006-01-02")
		h := ds.hours[u.Id][k]
		out = append(out, weekHours{WeekStart: k, Hours: h, Quota: quota, Met: quota > 0 && h >= quota, Paused: weekPaused(ds.pauses[u.Id], w)})
	}
	return out
}

// streak counts consecutive weeks with the quota met, ending with the last
// complete week (the current week counts too once it is already met).
// Paused weeks neither add to the streak nor break it.
func streak(hist []weekHours) int {
	n := 0
	for i := len(hist) - 1; i >= 0; i-- {
		if hist[i].Met {
			n++
		} else if hist[i].Paused {
			continue
		} else if i != len(hist)-1 {
			break
		}
	}
	return n
}

func (ds *dataset) memberAttendance(u *core.Record, now time.Time) (attendanceStats, map[string]*attendanceStats) {
	var total attendanceStats
	bySeries := map[string]*attendanceStats{}
	for _, m := range ds.meetings {
		if !m.GetDateTime("start_at").Time().Before(now) || !slices.Contains(m.GetStringSlice("members"), u.Id) {
			continue
		}
		st := ds.attendance[m.Id+"|"+u.Id]
		if (st == "" || st == "unexcused") && inPause(ds.pauses[u.Id], m.GetDateTime("start_at").Time()) {
			st = "excused" // on pause: missing a meeting is fine
		}
		total.add(st)
		s := m.GetString("series")
		if bySeries[s] == nil {
			bySeries[s] = &attendanceStats{}
		}
		bySeries[s].add(st)
	}
	total.finish()
	for _, s := range bySeries {
		s.finish()
	}
	return total, bySeries
}

func toView(m *core.Record, state string, now time.Time) meetingView {
	start, end := m.GetDateTime("start_at").Time(), m.GetDateTime("end_at").Time()
	return meetingView{
		ID: m.Id, Title: m.GetString("title"), Series: m.GetString("series"),
		Start: start, End: end, Location: m.GetString("location"), State: state,
		CanCheck: !now.Before(start.Add(-checkinEarly)) && !now.After(end.Add(checkinLate)),
	}
}

type memberSummary struct {
	ID           string                      `json:"id"`
	Name         string                      `json:"name"`
	Email        string                      `json:"email"`
	Tier         string                      `json:"tier"`
	WeeklyHours  float64                     `json:"weekly_hours"`
	IsAdmin      bool                        `json:"is_admin"`
	Jarvis       bool                        `json:"jarvis_enabled"`
	Role         string                      `json:"role"`
	Series       []string                    `json:"series"`
	Weeks        []weekHours                 `json:"weeks"`
	ThisWeek     float64                     `json:"this_week"`
	Progress     float64                     `json:"progress"` // this week / quota
	Expected     float64                     `json:"expected"` // pro-rata quota by today
	Behind       bool                        `json:"behind"`
	Paused       bool                        `json:"paused"`          // this week is on pause
	Pause        *pausePeriod                `json:"pause,omitempty"` // running or next pause
	Community    *communityStats             `json:"community,omitempty"`
	Streak       int                         `json:"streak"`
	Attendance   attendanceStats             `json:"attendance"`
	BySeries     map[string]*attendanceStats `json:"by_series"`
	TasksDone    int                         `json:"tasks_done"`
	LastTaskDone string                      `json:"last_task_done"`
}

func (ds *dataset) summary(u *core.Record, now time.Time) memberSummary {
	hist := ds.weekHistory(u)
	quota := u.GetFloat("weekly_hours")
	this := hist[len(hist)-1].Hours
	// Pro-rata over a 5-day week: by Wednesday you should have ~3/5 of it.
	day := min((int(now.In(Location).Weekday())+6)%7+1, 5)
	expected := quota * float64(day) / 5
	att, bySeries := ds.memberAttendance(u, now)
	s := memberSummary{
		ID: u.Id, Name: u.GetString("name"), Email: u.Email(), Tier: u.GetString("tier"),
		WeeklyHours: quota, IsAdmin: u.GetBool("is_admin"), Jarvis: u.GetBool("jarvis_enabled"), Role: RoleOf(u), Series: u.GetStringSlice("series"),
		Weeks: hist, ThisWeek: this, Expected: expected, Behind: this < expected && !hist[len(hist)-1].Paused,
		Paused: hist[len(hist)-1].Paused, Pause: currentOrNextPause(ds.pauses[u.Id], now), Community: ds.community(u, now),
		Streak: streak(hist), Attendance: att, BySeries: bySeries,
		TasksDone: ds.tasksDone[u.Id], LastTaskDone: ds.lastDone[u.Id],
	}
	if quota > 0 {
		s.Progress = this / quota
	}
	return s
}

// GET /api/team/me — everything the member dashboard needs.
func handleMe(e *core.RequestEvent) error {
	ds, err := loadDataset(e.App)
	if err != nil {
		return e.InternalServerError("", err)
	}
	return e.JSON(200, memberDetail(e.App, ds, e.Auth, time.Now()))
}

func memberDetail(app core.App, ds *dataset, u *core.Record, now time.Time) map[string]any {
	var past, upcoming []meetingView
	for _, m := range ds.meetings {
		if !slices.Contains(m.GetStringSlice("members"), u.Id) {
			continue
		}
		key := m.Id + "|" + u.Id
		v := toView(m, ds.attendance[key], now)
		v.Notice, v.Late = ds.notice[key], ds.late[key]
		if v.Start.Before(now) {
			past = append(past, v)
		} else if v.Start.Before(now.AddDate(0, 0, 14)) {
			upcoming = append(upcoming, v)
		}
	}
	slices.Reverse(past)
	return map[string]any{
		"summary":    ds.summary(u, now),
		"past":       past,
		"upcoming":   upcoming,
		"tasks_done": completedTaskList(app, u.Id),
		"pauses":     pausesOrEmpty(ds.pauses[u.Id]),
	}
}

// GET /api/team/meetings/upcoming — meetings around now (for clock-in and admin roll-call).
func handleUpcoming(e *core.RequestEvent) error {
	now := time.Now()
	recs, err := e.App.FindRecordsByFilter(colMeetings, "end_at >= {:from} && start_at <= {:to}", "start_at", 50, 0,
		dbx.Params{"from": dbTime(now.AddDate(0, 0, -7)), "to": dbTime(now.AddDate(0, 0, 14))})
	if err != nil {
		return e.InternalServerError("", err)
	}
	out := make([]meetingView, 0, len(recs))
	for _, m := range recs {
		member := slices.Contains(m.GetStringSlice("members"), e.Auth.Id)
		if !Can(e.Auth, PermTeamView) && !member {
			continue
		}
		v := toView(m, "", now)
		v.Member = member
		if a, err := e.App.FindFirstRecordByFilter(colAttendance, "meeting = {:m} && user = {:u}", dbx.Params{"m": m.Id, "u": e.Auth.Id}); err == nil {
			v.State = a.GetString("state")
			if a.GetString("source") == "notice" {
				v.Notice, v.Late = a.GetString("note"), a.GetBool("notice_late")
			}
		}
		out = append(out, v)
	}
	return e.JSON(200, out)
}

// GET /api/team/overview — admin analytics across members, tiers, series and weeks.
func handleOverview(e *core.RequestEvent) error {
	ds, err := loadDataset(e.App)
	if err != nil {
		return e.InternalServerError("", err)
	}
	now := time.Now()
	members := make([]memberSummary, 0, len(ds.users))
	for _, u := range ds.users {
		members = append(members, ds.summary(u, now))
	}

	// Organisation-level weekly totals.
	type weekAgg struct {
		WeekStart string  `json:"week_start"`
		Hours     float64 `json:"hours"`
		Quota     float64 `json:"quota"`
		MetCount  int     `json:"met_count"`
	}
	weeks := make([]weekAgg, len(ds.weeks))
	for i, w := range ds.weeks {
		weeks[i].WeekStart = w.Format("2006-01-02")
		for _, m := range members {
			weeks[i].Hours += m.Weeks[i].Hours
			if !m.Weeks[i].Paused {
				weeks[i].Quota += m.Weeks[i].Quota
			}
			if m.Weeks[i].Met {
				weeks[i].MetCount++
			}
		}
	}

	// Per-series attendance over time (each held meeting).
	type meetingAgg struct {
		ID      string          `json:"id"`
		Title   string          `json:"title"`
		Series  string          `json:"series"`
		Start   time.Time       `json:"start"`
		Members int             `json:"members"`
		Stats   attendanceStats `json:"stats"`
	}
	var held []meetingAgg
	seriesStats := map[string]*attendanceStats{}
	for _, m := range ds.meetings {
		start := m.GetDateTime("start_at").Time()
		if !start.Before(now) {
			continue
		}
		agg := meetingAgg{ID: m.Id, Title: m.GetString("title"), Series: m.GetString("series"), Start: start}
		for _, uid := range m.GetStringSlice("members") {
			agg.Members++
			agg.Stats.add(ds.attendance[m.Id+"|"+uid])
			if seriesStats[agg.Series] == nil {
				seriesStats[agg.Series] = &attendanceStats{}
			}
			seriesStats[agg.Series].add(ds.attendance[m.Id+"|"+uid])
		}
		agg.Stats.finish()
		held = append(held, agg)
	}
	for _, s := range seriesStats {
		s.finish()
	}

	// Per-tier averages.
	type tierAgg struct {
		Tier        string  `json:"tier"`
		Members     int     `json:"members"`
		AvgProgress float64 `json:"avg_progress"`
		AvgAttend   float64 `json:"avg_attendance"`
		BehindCount int     `json:"behind_count"`
	}
	tiers := map[string]*tierAgg{}
	for _, m := range members {
		t := tiers[m.Tier]
		if t == nil {
			t = &tierAgg{Tier: m.Tier}
			tiers[m.Tier] = t
		}
		t.Members++
		t.AvgProgress += m.Progress
		t.AvgAttend += m.Attendance.Rate
		if m.Behind {
			t.BehindCount++
		}
	}
	tierList := []tierAgg{}
	for _, name := range []string{"Core", "Impact", "GO!"} {
		if t := tiers[name]; t != nil {
			t.AvgProgress /= float64(t.Members)
			t.AvgAttend /= float64(t.Members)
			tierList = append(tierList, *t)
		}
	}

	return e.JSON(200, map[string]any{
		"generated_at": now,
		"week_start":   ds.weeks[len(ds.weeks)-1].Format("2006-01-02"),
		"members":      members,
		"weeks":        weeks,
		"meetings":     held,
		"series":       seriesStats,
		"tiers":        tierList,
	})
}

// GET /api/team/members/{id} — admin drill-down into one member's history.
func handleMember(e *core.RequestEvent) error {
	ds, err := loadDataset(e.App)
	if err != nil {
		return e.InternalServerError("", err)
	}
	id := e.Request.PathValue("id")
	for _, u := range ds.users {
		if u.Id == id {
			return e.JSON(200, memberDetail(e.App, ds, u, time.Now()))
		}
	}
	return e.NotFoundError("Member not found.", nil)
}

func pausesOrEmpty(ps []pausePeriod) []pausePeriod {
	if ps == nil {
		return []pausePeriod{}
	}
	return ps
}
