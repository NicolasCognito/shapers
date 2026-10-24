package team

import (
	"fmt"
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
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, Location), nil
	}
	t, err := time.ParseInLocation("2006-01-02", v[:min(10, len(v))], Location)
	return t, err
}

func importRoster(app core.App, dir string) (int, error) {
	rows, err := readSheet(filepath.Join(dir, "roster.xlsx"))
	if err != nil {
		return 0, err
	}
	col, err := app.FindCollectionByNameOrId(colUsers)
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
		rec, err := app.FindAuthRecordByEmail(colUsers, email)
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
	for _, ev := range ParseICS(string(data)) {
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
	meetings, err := app.FindAllRecords(colMeetings)
	if err != nil {
		return 0, err
	}
	// series|YYYY-MM-DD (local) -> meeting id
	byKey := map[string]string{}
	for _, m := range meetings {
		day := m.GetDateTime("start_at").Time().In(Location).Format("2006-01-02")
		byKey[m.GetString("series")+"|"+day] = m.Id
	}
	col, err := app.FindCollectionByNameOrId(colAttendance)
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
		rec, err := app.FindFirstRecordByFilter(colAttendance, "meeting = {:m} && user = {:u}", dbx.Params{"m": mid, "u": uid})
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
	col, err := app.FindCollectionByNameOrId(colHours)
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
