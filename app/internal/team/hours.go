package team

import (
	"errors"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

// selfLogAllowed reports whether a member may log hours for this date
// without a request: today or yesterday in organisation time.
func selfLogAllowed(date time.Time) bool {
	now := time.Now().In(org.Location)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, org.Location)
	return !date.Before(today.AddDate(0, 0, -1))
}

var ErrOldDate = errors.New("you can log hours only for today or yesterday; for older dates send a request to the admins")

func registerHourLimits(app core.App) {
	check := func(e *core.RecordRequestEvent) error {
		if org.Can(e.Auth, org.PermHoursManage) {
			return e.Next()
		}
		dates := []time.Time{e.Record.GetDateTime("date").Time()}
		if !e.Record.IsNew() {
			dates = append(dates, e.Record.Original().GetDateTime("date").Time())
		}
		for _, d := range dates {
			if !selfLogAllowed(d) {
				return e.BadRequestError(ErrOldDate.Error(), nil)
			}
		}
		return e.Next()
	}
	app.OnRecordCreateRequest(org.ColHourLogs).BindFunc(check)
	app.OnRecordUpdateRequest(org.ColHourLogs).BindFunc(check)
}

// LogHours records hours for the actor (source "agent").
func LogHours(app core.App, actorID string, date time.Time, hours float64, note, project string) (map[string]any, error) {
	if hours < 0.25 || hours > 24 {
		return nil, errors.New("hours must be between 0.25 and 24")
	}
	if date.After(time.Now().Add(24 * time.Hour)) {
		return nil, errors.New("cannot log hours in the future")
	}
	if u, err := org.FindUser(app, actorID); err == nil && !org.Can(u, org.PermHoursManage) && !selfLogAllowed(date) {
		return nil, ErrOldDate
	}
	col, err := app.FindCollectionByNameOrId(org.ColHourLogs)
	if err != nil {
		return nil, err
	}
	rec := core.NewRecord(col)
	rec.Set("user", actorID)
	rec.Set("date", org.DBTime(date))
	rec.Set("hours", hours)
	rec.Set("note", note)
	rec.Set("project", project)
	rec.Set("source", "agent")
	if err := app.Save(rec); err != nil {
		return nil, err
	}
	week := org.WeekStart(date)
	logs, _ := app.FindRecordsByFilter(org.ColHourLogs, "user = {:u} && date >= {:from} && date < {:to}", "", 0, 0,
		dbx.Params{"u": actorID, "from": org.DBTime(week), "to": org.DBTime(week.AddDate(0, 0, 7))})
	total := 0.0
	for _, l := range logs {
		total += l.GetFloat("hours")
	}
	u, _ := org.FindUser(app, actorID)
	quota := 0.0
	if u != nil {
		quota = u.GetFloat("weekly_hours")
	}
	return map[string]any{
		"ok": true, "id": rec.Id, "date": date.In(org.Location).Format("2006-01-02"), "hours": hours,
		"week_start": week.Format("2006-01-02"), "week_total": total, "weekly_quota": quota,
	}, nil
}

type HourLogView struct {
	ID     string  `json:"id"`
	Date   string  `json:"date"`
	Hours  float64 `json:"hours"`
	Note   string  `json:"note"`
	Source string  `json:"source"`
}

func toLogView(r *core.Record) HourLogView {
	return HourLogView{
		ID: r.Id, Date: r.GetDateTime("date").Time().In(org.Location).Format("2006-01-02"),
		Hours: r.GetFloat("hours"), Note: r.GetString("note"), Source: r.GetString("source"),
	}
}

func ViewHourLog(r *core.Record) HourLogView { return toLogView(r) }

// FindMyHourLogs lists the actor's hour logs on a date (YYYY-MM-DD), or the
// five most recent when date is empty.
func FindMyHourLogs(app core.App, actorID, date string) ([]HourLogView, error) {
	filter, params := "user = {:u}", dbx.Params{"u": actorID}
	limit := 5
	if date != "" {
		d, err := time.ParseInLocation("2006-01-02", date, org.Location)
		if err != nil {
			return nil, errors.New("date must be YYYY-MM-DD")
		}
		filter += " && date >= {:from} && date < {:to}"
		params["from"], params["to"] = org.DBTime(d), org.DBTime(d.AddDate(0, 0, 1))
		limit = 50
	}
	recs, err := app.FindRecordsByFilter(org.ColHourLogs, filter, "-date,-created", limit, 0, params)
	if err != nil {
		return nil, err
	}
	out := make([]HourLogView, 0, len(recs))
	for _, r := range recs {
		out = append(out, toLogView(r))
	}
	return out, nil
}

// HourLogForDelete loads a log the actor may delete: their own, or anyone's for admins.
func HourLogForDelete(app core.App, actorID, logID string) (*core.Record, error) {
	rec, err := app.FindRecordById(org.ColHourLogs, logID)
	if err != nil {
		return nil, errors.New("hour entry not found")
	}
	if rec.GetString("user") != actorID {
		actor, err := org.FindUser(app, actorID)
		if err != nil || !org.Can(actor, org.PermHoursManage) {
			return nil, errors.New("you can only delete your own hours")
		}
	}
	return rec, nil
}
