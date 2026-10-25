package team

import (
	"context"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"
	"github.com/xuri/excelize/v2"
	"github.com/xusenlin/workavera/internal/board"
	"github.com/xusenlin/workavera/internal/gcal"
	"github.com/xusenlin/workavera/internal/org"
)

// `workavera import-sandbox <dir>` loads roster, meetings, attendance and
// hours from the hackathon sandbox package. Safe to re-run (upserts).
func newImportCommand(app *pocketbase.PocketBase) *cobra.Command {
	return &cobra.Command{
		Use:   "import-sandbox [dir]",
		Short: "Import sandbox roster.xlsx, meetings.ics, attendance and hours",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := app.Bootstrap(); err != nil {
				return err
			}
			return ImportSandbox(app, args[0])
		},
	}
}

func ImportSandbox(app core.App, dir string) error {
	steps := []struct {
		name string
		fn   func(core.App, string) (int, error)
	}{
		{"roster", importRoster},
		{"projects", importProjects},
		{"meetings", importMeetings},
		{"attendance", importAttendance},
		{"hours", importHours},
	}
	for _, s := range steps {
		n, err := s.fn(app, dir)
		if err != nil {
			return fmt.Errorf("%s: %w", s.name, err)
		}
		fmt.Printf("imported %-10s %d\n", s.name, n)
	}
	return nil
}

func readSheet(path string) ([]map[string]string, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	rows, err := f.GetRows(f.GetSheetName(0), excelize.Options{RawCellValue: true})
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	header := rows[0]
	var out []map[string]string
	for _, r := range rows[1:] {
		m := map[string]string{}
		for i, h := range header {
			if i < len(r) {
				m[strings.TrimSpace(h)] = strings.TrimSpace(r[i])
			}
		}
		out = append(out, m)
	}
	return out, nil
}

// excelDate converts an Excel serial date ("46279") or ISO string to a day.
func excelDate(v string) (time.Time, error) {
	if f, err := strconv.ParseFloat(v, 64); err == nil {
		t, err := excelize.ExcelDateToTime(f, false)
		if err != nil {
			return time.Time{}, err
		}
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, org.Location), nil
	}
	t, err := time.ParseInLocation("2006-01-02", v[:min(10, len(v))], org.Location)
	return t, err
}

func importRoster(app core.App, dir string) (int, error) {
	rows, err := readSheet(filepath.Join(dir, "roster.xlsx"))
	if err != nil {
		return 0, err
	}
	col, err := app.FindCollectionByNameOrId(org.ColUsers)
	if err != nil {
		return 0, err
	}
	password := os.Getenv("SANDBOX_PASSWORD")
	if password == "" {
		password = "shapers2026"
	}
	n := 0
	for _, r := range rows {
		email := strings.ToLower(r["email"])
		if email == "" {
			continue
		}
		rec, err := app.FindAuthRecordByEmail(org.ColUsers, email)
		if err != nil {
			rec = core.NewRecord(col)
			rec.SetEmail(email)
			rec.SetPassword(password)
			rec.SetVerified(true)
		}
		hours, _ := strconv.ParseFloat(r["weekly_hours"], 64)
		var series []string
		for _, s := range strings.Split(r["series"], ";") {
			if s = strings.TrimSpace(s); s != "" {
				series = append(series, s)
			}
		}
		rec.Set("name", r["name"])
		rec.Set("tier", r["tier"])
		rec.Set("weekly_hours", hours)
		rec.Set("is_admin", strings.EqualFold(r["admin"], "yes"))
		rec.Set("series", series)
		if err := app.Save(rec); err != nil {
			return n, fmt.Errorf("%s: %w", email, err)
		}
		n++
	}
	return n, nil
}

func importMeetings(app core.App, dir string) (int, error) {
	data, err := os.ReadFile(filepath.Join(dir, "meetings.ics"))
	if err != nil {
		return 0, err
	}
	users, err := usersByEmail(app)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, ev := range gcal.ParseICS(string(data)) {
		ok, err := UpsertMeeting(app, ev, users)
		if err != nil {
			return n, err
		}
		if ok {
			n++
		}
	}
	return n, nil
}

func importAttendance(app core.App, dir string) (int, error) {
	rows, err := readSheet(filepath.Join(dir, "attendance flat.xlsx"))
	if err != nil {
		return 0, err
	}
	users, err := usersByEmail(app)
	if err != nil {
		return 0, err
	}
	meetings, err := app.FindAllRecords(org.ColMeetings)
	if err != nil {
		return 0, err
	}
	// series|YYYY-MM-DD (local) -> meeting id
	byKey := map[string]string{}
	for _, m := range meetings {
		day := m.GetDateTime("start_at").Time().In(org.Location).Format("2006-01-02")
		byKey[m.GetString("series")+"|"+day] = m.Id
	}
	col, err := app.FindCollectionByNameOrId(org.ColAttendance)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, r := range rows {
		day, err := excelDate(r["date"])
		if err != nil {
			continue
		}
		mid, uid := byKey[r["series"]+"|"+day.Format("2006-01-02")], users[strings.ToLower(r["email"])]
		if mid == "" || uid == "" {
			continue
		}
		rec, err := app.FindFirstRecordByFilter(org.ColAttendance, "meeting = {:m} && user = {:u}", dbx.Params{"m": mid, "u": uid})
		if err != nil {
			rec = core.NewRecord(col)
			rec.Set("meeting", mid)
			rec.Set("user", uid)
		}
		rec.Set("state", r["state"])
		rec.Set("source", "import")
		if err := app.Save(rec); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

func importHours(app core.App, dir string) (int, error) {
	rows, err := readSheet(filepath.Join(dir, "hours.xlsx"))
	if err != nil {
		return 0, err
	}
	users, err := usersByEmail(app)
	if err != nil {
		return 0, err
	}
	col, err := app.FindCollectionByNameOrId(org.ColHourLogs)
	if err != nil {
		return 0, err
	}
	// Re-import replaces previously imported rows.
	if _, err := app.DB().NewQuery("DELETE FROM hour_logs WHERE source = 'import'").Execute(); err != nil {
		return 0, err
	}
	n := 0
	for _, r := range rows {
		uid := users[strings.ToLower(r["email"])]
		week, err := excelDate(r["week_start"])
		hours, herr := strconv.ParseFloat(r["hours"], 64)
		if uid == "" || err != nil || herr != nil || hours <= 0 {
			continue
		}
		rec := core.NewRecord(col)
		rec.Set("user", uid)
		rec.Set("date", week.UTC())
		rec.Set("hours", hours)
		rec.Set("note", "Weekly total (imported)")
		rec.Set("source", "import")
		if err := app.Save(rec); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

// The sandbox promises "ten project names" but none were shipped; these are
// placeholders until the organisers send the real list.
var sandboxProjects = []struct {
	name, desc string
	tasks      []string
}{
	{"Summer School 2027", "Programme, venue and applications for next summer", []string{"Book the venue", "Draft programme outline", "Open applications form", "Invite three guest lecturers", "Budget v1"}},
	{"Erasmus+ grant", "KA2 partnership application", []string{"Find two partner organisations", "Write project rationale", "Budget table", "Collect letters of intent", "Submit before deadline"}},
	{"Shape Talks season", "Monthly public talks", []string{"Shortlist speakers", "Book Impact Hub event room", "Design poster template", "Set up registration page", "Record and publish talk #1"}},
	{"Community onboarding", "Make the first month easy for newcomers", []string{"Write welcome guide", "Buddy system pairs", "Onboarding checklist in Slack", "First-week coffee meetups"}},
	{"Website relaunch", "New site with events and team pages", []string{"Content inventory", "Pick a template", "Team page photos", "Events page from calendar", "Launch and announce"}},
	{"Shapers Voice podcast", "Monthly episode with members and alumni", []string{"Episode 1 guest", "Record intro jingle", "Publish on Spotify", "Write show notes"}},
	{"Shapers Tech platform", "Internal tools for the institute", []string{"Collect pain points from members", "Hackathon handover", "Set up hosting", "Train admins"}},
	{"Annual report 2026", "Numbers and stories from the year", []string{"Collect hours and attendance stats", "Interview five members", "Layout draft", "Board review"}},
	{"Partnerships", "Companies and NGOs we work with", []string{"Partner list update", "Meeting with Impact Hub", "Sponsorship deck", "Follow-up emails"}},
	{"Fundraising dinner", "Year-end event for supporters", []string{"Pick a date", "Guest list", "Catering offers", "Program and speakers"}},
}

func importProjects(app core.App, _ string) (int, error) {
	admin, err := app.FindFirstRecordByFilter(org.ColUsers, "is_admin = true && tier != ''")
	if err != nil {
		return 0, fmt.Errorf("no admin to own projects: %w", err)
	}
	users, err := app.FindRecordsByFilter(org.ColUsers, "tier != ''", "", 0, 0)
	if err != nil {
		return 0, err
	}
	rng := rand.New(rand.NewSource(42))
	ctx := context.Background()
	now := time.Now()
	priorities := []string{"none", "low", "medium", "medium", "high", "urgent"}
	n := 0
	for _, sp := range sandboxProjects {
		if _, err := app.FindFirstRecordByFilter("board_projects", "name = {:n}", dbx.Params{"n": sp.name}); err == nil {
			continue // already imported
		}
		res, err := board.CreateProject(ctx, app, admin.Id, board.CreateProjectCommand{
			Name: sp.name, Description: sp.desc,
			States: []board.TemplateState{
				{Name: "To do", Color: "#94a3b8", Category: "pending"},
				{Name: "In progress", Color: "#3b82f6", Category: "active"},
				{Name: "Done", Color: "#22c55e", Category: "completed"},
			},
		})
		if err != nil {
			return n, fmt.Errorf("%s: %w", sp.name, err)
		}
		project, err := app.FindRecordById("board_projects", res.ID)
		if err != nil {
			return n, err
		}
		if err := addEveryoneToProject(app, project); err != nil {
			return n, err
		}
		states, err := app.FindRecordsByFilter("board_project_states", "project = {:p}", "sort_order", 0, 0, dbx.Params{"p": res.ID})
		if err != nil || len(states) < 3 {
			return n, fmt.Errorf("%s: states missing", sp.name)
		}
		for i, title := range sp.tasks {
			// Earlier tasks in each list are more likely to be finished.
			stateIdx := 0
			switch r := rng.Float64(); {
			case i < 2 && r < 0.8, r < 0.3:
				stateIdx = 2
			case r < 0.6:
				stateIdx = 1
			}
			assignee := users[rng.Intn(len(users))].Id
			due := now.AddDate(0, 0, rng.Intn(28)-7).Format("2006-01-02") + " 12:00:00.000Z"
			task, err := board.CreateTask(ctx, app, admin.Id, board.CreateTaskCommand{
				ProjectID: res.ID, StateID: states[stateIdx].Id, Title: title,
				Priority: priorities[rng.Intn(len(priorities))], DueDate: due,
				AssigneeIDs: []string{assignee},
			})
			if err != nil {
				return n, fmt.Errorf("%s / %s: %w", sp.name, title, err)
			}
			if stateIdx == 2 {
				// Spread completions over the last six weeks for the analytics.
				done := now.AddDate(0, 0, -rng.Intn(42)).UTC().Format("2006-01-02 15:04:05.000Z")
				if _, err := app.DB().NewQuery("UPDATE board_tasks SET updated = {:d} WHERE id = {:id}").
					Bind(dbx.Params{"d": done, "id": task.ID}).Execute(); err != nil {
					return n, err
				}
			}
		}
		n++
	}
	return n, nil
}
