package team

import (
	"errors"
	"log/slog"
	"os"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// ---------- Jarvis model from .env ----------

const jarvisModelName = "Jarvis (DeepSeek)"

type envModel struct{ key, baseURL, modelID string }

func jarvisModelFromEnv() (envModel, bool) {
	m := envModel{
		key:     strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
		baseURL: strings.TrimSpace(os.Getenv("DEEPSEEK_BASE_URL")),
		modelID: strings.TrimSpace(os.Getenv("DEEPSEEK_MODEL")),
	}
	if m.baseURL == "" {
		m.baseURL = "https://api.deepseek.com"
	}
	if m.modelID == "" {
		m.modelID = "deepseek-chat"
	}
	return m, m.key != ""
}

// ensureJarvisModel gives the user a ready chat model built from .env, so
// nobody has to paste an API key before talking to Jarvis. Re-running it
// refreshes the key and model id from the current environment.
func ensureJarvisModel(app core.App, userID string) error {
	env, ok := jarvisModelFromEnv()
	if !ok {
		return nil
	}
	rec, err := app.FindFirstRecordByFilter("llm_models", "owner = {:o} && name = {:n}", dbx.Params{"o": userID, "n": jarvisModelName})
	if err != nil {
		col, err := app.FindCollectionByNameOrId("llm_models")
		if err != nil {
			return err
		}
		rec = core.NewRecord(col)
		rec.Set("owner", userID)
		rec.Set("name", jarvisModelName)
		rec.Set("max_output_tokens", 8000)
		rec.Set("max_context_tokens", 64000)
		// Default only if the user has no default yet.
		if _, err := app.FindFirstRecordByFilter("llm_models", "owner = {:o} && is_default = true", dbx.Params{"o": userID}); err != nil {
			rec.Set("is_default", true)
		}
	}
	rec.Set("model_id", env.modelID)
	rec.Set("base_url", env.baseURL)
	rec.Set("api_key", env.key)
	rec.Set("protocol", "openai-compatible")
	return app.Save(rec)
}

func registerJarvisModel(app core.App) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		users, err := se.App.FindAllRecords(colUsers)
		if err == nil {
			for _, u := range users {
				if err := ensureJarvisModel(se.App, u.Id); err != nil {
					slog.Warn("team: jarvis model", "user", u.Id, "error", err)
				}
			}
		}
		return se.Next()
	})
	app.OnRecordAfterCreateSuccess(colUsers).BindFunc(func(e *core.RecordEvent) error {
		if err := ensureJarvisModel(e.App, e.Record.Id); err != nil {
			slog.Warn("team: jarvis model", "user", e.Record.Id, "error", err)
		}
		return e.Next()
	})
}

// ---------- queries used by Jarvis tools ----------

var ErrForbidden = errors.New("only admins can see other members' data")

func findUser(app core.App, id string) (*core.Record, error) {
	return app.FindRecordById(colUsers, id)
}

// MyWeek is the member's own summary plus this and next week's meetings.
func MyWeek(app core.App, actorID string) (map[string]any, error) {
	u, err := findUser(app, actorID)
	if err != nil {
		return nil, err
	}
	ds, err := loadDataset(app)
	if err != nil {
		return nil, err
	}
	d := memberDetail(app, ds, u, time.Now())
	past, _ := d["past"].([]meetingView)
	if len(past) > 5 {
		d["past"] = past[:5]
	}
	tasks, _ := d["tasks_done"].([]doneTask)
	if len(tasks) > 10 {
		d["tasks_done"] = tasks[:10]
	}
	return d, nil
}

// LogHours records hours for the actor (source "agent").
func LogHours(app core.App, actorID string, date time.Time, hours float64, note, project string) (map[string]any, error) {
	if hours < 0.25 || hours > 24 {
		return nil, errors.New("hours must be between 0.25 and 24")
	}
	if date.After(time.Now().Add(24 * time.Hour)) {
		return nil, errors.New("cannot log hours in the future")
	}
	if u, err := findUser(app, actorID); err == nil && !Can(u, PermHoursManage) && !selfLogAllowed(date) {
		return nil, ErrOldDate
	}
	col, err := app.FindCollectionByNameOrId(colHours)
	if err != nil {
		return nil, err
	}
	rec := core.NewRecord(col)
	rec.Set("user", actorID)
	rec.Set("date", dbTime(date))
	rec.Set("hours", hours)
	rec.Set("note", note)
	rec.Set("project", project)
	rec.Set("source", "agent")
	if err := app.Save(rec); err != nil {
		return nil, err
	}
	week := WeekStart(date)
	logs, _ := app.FindRecordsByFilter(colHours, "user = {:u} && date >= {:from} && date < {:to}", "", 0, 0,
		dbx.Params{"u": actorID, "from": dbTime(week), "to": dbTime(week.AddDate(0, 0, 7))})
	total := 0.0
	for _, l := range logs {
		total += l.GetFloat("hours")
	}
	u, _ := findUser(app, actorID)
	quota := 0.0
	if u != nil {
		quota = u.GetFloat("weekly_hours")
	}
	return map[string]any{
		"ok": true, "id": rec.Id, "date": date.In(Location).Format("2006-01-02"), "hours": hours,
		"week_start": week.Format("2006-01-02"), "week_total": total, "weekly_quota": quota,
	}, nil
}

type laggard struct {
	Name       string   `json:"name"`
	Email      string   `json:"email"`
	Tier       string   `json:"tier"`
	ThisWeek   float64  `json:"this_week_hours"`
	Expected   float64  `json:"expected_by_today"`
	Quota      float64  `json:"weekly_quota"`
	Attendance float64  `json:"attendance_rate"`
	Unexcused  int      `json:"unexcused_absences"`
	Streak     int      `json:"streak_weeks"`
	Reasons    []string `json:"reasons"`
}

// WhoIsBehind lists members behind on hours this week or with weak attendance.
func WhoIsBehind(app core.App, actorID string, minAttendance float64) (map[string]any, error) {
	u, err := findUser(app, actorID)
	if err != nil {
		return nil, err
	}
	if !Can(u, PermTeamView) {
		return nil, ErrForbidden
	}
	if minAttendance <= 0 || minAttendance > 1 {
		minAttendance = 0.7
	}
	ds, err := loadDataset(app)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	out := []laggard{}
	for _, m := range ds.users {
		s := ds.summary(m, now)
		var reasons []string
		if s.Behind {
			reasons = append(reasons, "behind on hours this week")
		}
		held := s.Attendance.Present + s.Attendance.Remote + s.Attendance.Excused + s.Attendance.Unexcused + s.Attendance.Unmarked
		if held > 0 && s.Attendance.Rate < minAttendance {
			reasons = append(reasons, "low attendance")
		}
		if s.Attendance.Unexcused > 0 {
			reasons = append(reasons, "unexcused absences")
		}
		if len(reasons) == 0 {
			continue
		}
		out = append(out, laggard{
			Name: s.Name, Email: s.Email, Tier: s.Tier, ThisWeek: s.ThisWeek, Expected: s.Expected,
			Quota: s.WeeklyHours, Attendance: s.Attendance.Rate, Unexcused: s.Attendance.Unexcused,
			Streak: s.Streak, Reasons: reasons,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		gi, gj := out[i].Expected-out[i].ThisWeek, out[j].Expected-out[j].ThisWeek
		if len(out[i].Reasons) != len(out[j].Reasons) {
			return len(out[i].Reasons) > len(out[j].Reasons)
		}
		return gi > gj
	})
	return map[string]any{
		"week_start": ds.weeks[len(ds.weeks)-1].Format("2006-01-02"),
		"members":    len(ds.users),
		"flagged":    out,
	}, nil
}

// MemberReport returns one member's summary, found by name or email
// fragment. Members may only look themselves up.
func MemberReport(app core.App, actorID, query string) (map[string]any, error) {
	actor, err := findUser(app, actorID)
	if err != nil {
		return nil, err
	}
	ds, err := loadDataset(app)
	if err != nil {
		return nil, err
	}
	q := strings.ToLower(strings.TrimSpace(query))
	var matches []*core.Record
	for _, u := range ds.users {
		if q == "" && u.Id == actorID ||
			q != "" && (strings.Contains(strings.ToLower(u.GetString("name")), q) || strings.Contains(strings.ToLower(u.Email()), q)) {
			matches = append(matches, u)
		}
	}
	if len(matches) == 0 {
		return nil, errors.New("no member matches " + query)
	}
	if len(matches) > 1 {
		names := make([]string, 0, len(matches))
		for _, m := range matches {
			names = append(names, m.GetString("name"))
		}
		return map[string]any{"ambiguous": true, "candidates": names}, nil
	}
	m := matches[0]
	if m.Id != actorID && !Can(actor, PermTeamView) {
		return nil, ErrForbidden
	}
	return map[string]any{"summary": ds.summary(m, time.Now())}, nil
}

// AttendanceReport gives per-series attendance. Admins see everyone, members
// see only themselves.
func AttendanceReport(app core.App, actorID, series string) (map[string]any, error) {
	actor, err := findUser(app, actorID)
	if err != nil {
		return nil, err
	}
	ds, err := loadDataset(app)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	series = strings.TrimSpace(series)
	if !Can(actor, PermTeamView) {
		total, bySeries := ds.memberAttendance(actor, now)
		return map[string]any{"scope": "me", "total": total, "by_series": bySeries}, nil
	}
	type row struct {
		Title  string          `json:"title"`
		Series string          `json:"series"`
		Start  string          `json:"start"`
		Stats  attendanceStats `json:"stats"`
		Absent []string        `json:"unexcused"`
	}
	names := map[string]string{}
	for _, u := range ds.users {
		names[u.Id] = u.GetString("name")
	}
	var rows []row
	seriesTotals := map[string]*attendanceStats{}
	for _, m := range ds.meetings {
		start := m.GetDateTime("start_at").Time()
		if !start.Before(now) || series != "" && !strings.EqualFold(m.GetString("series"), series) {
			continue
		}
		r := row{Title: m.GetString("title"), Series: m.GetString("series"), Start: start.In(Location).Format("2006-01-02 15:04")}
		for _, uid := range m.GetStringSlice("members") {
			st := ds.attendance[m.Id+"|"+uid]
			r.Stats.add(st)
			if seriesTotals[r.Series] == nil {
				seriesTotals[r.Series] = &attendanceStats{}
			}
			seriesTotals[r.Series].add(st)
			if st == "unexcused" && names[uid] != "" {
				r.Absent = append(r.Absent, names[uid])
			}
		}
		r.Stats.finish()
		rows = append(rows, r)
	}
	for _, s := range seriesTotals {
		s.finish()
	}
	slices.Reverse(rows)
	if len(rows) > 15 {
		rows = rows[:15]
	}
	return map[string]any{"scope": "team", "by_series": seriesTotals, "recent_meetings": rows}, nil
}
