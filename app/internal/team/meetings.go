package team

import (
	"log/slog"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/gcal"
	"github.com/xusenlin/workavera/internal/org"
	"github.com/xusenlin/workavera/internal/slack"
)

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

func toView(m *core.Record, state string, now time.Time) meetingView {
	start, end := m.GetDateTime("start_at").Time(), m.GetDateTime("end_at").Time()
	return meetingView{
		ID: m.Id, Title: m.GetString("title"), Series: m.GetString("series"),
		Start: start, End: end, Location: m.GetString("location"), State: state,
		CanCheck: !now.Before(start.Add(-checkinEarly)) && !now.After(end.Add(checkinLate)),
	}
}

// GET /api/team/meetings/upcoming — meetings around now (for clock-in and admin roll-call).
func handleUpcoming(e *core.RequestEvent) error {
	now := time.Now()
	recs, err := e.App.FindRecordsByFilter(org.ColMeetings, "end_at >= {:from} && start_at <= {:to}", "start_at", 50, 0,
		dbx.Params{"from": org.DBTime(now.AddDate(0, 0, -7)), "to": org.DBTime(now.AddDate(0, 0, 14))})
	if err != nil {
		return e.InternalServerError("", err)
	}
	out := make([]meetingView, 0, len(recs))
	for _, m := range recs {
		member := slices.Contains(m.GetStringSlice("members"), e.Auth.Id)
		if !org.Can(e.Auth, org.PermTeamView) && !member {
			continue
		}
		v := toView(m, "", now)
		v.Member = member
		if a, err := e.App.FindFirstRecordByFilter(org.ColAttendance, "meeting = {:m} && user = {:u}", dbx.Params{"m": m.Id, "u": e.Auth.Id}); err == nil {
			v.State = a.GetString("state")
			if a.GetString("source") == "notice" {
				v.Notice, v.Late = a.GetString("note"), a.GetBool("notice_late")
			}
		}
		out = append(out, v)
	}
	return e.JSON(200, out)
}

// parseDescription reads "Series: X" and "Members: a@x, b@y" lines.
func parseDescription(desc string) (series string, emails []string) {
	desc = strings.ReplaceAll(desc, `\n`, "\n")
	for _, line := range strings.Split(desc, "\n") {
		line = strings.TrimSpace(stripTags(line))
		lower := strings.ToLower(line)
		switch {
		case strings.HasPrefix(lower, "series:"):
			series = strings.TrimSpace(line[len("series:"):])
		case strings.HasPrefix(lower, "members:"):
			for _, e := range strings.Split(line[len("members:"):], ",") {
				if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
					emails = append(emails, e)
				}
			}
		}
	}
	return series, emails
}

// Google returns HTML descriptions sometimes (<br>, <a href=mailto:...>).
func stripTags(s string) string {
	var b strings.Builder
	in := false
	for _, r := range s {
		switch {
		case r == '<':
			in = true
		case r == '>':
			in = false
		case !in:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func resolveSeries(in gcal.Event, fromDesc string) string {
	for _, cand := range []string{fromDesc, in.Category, in.Title} {
		for _, s := range org.Series {
			if strings.EqualFold(strings.TrimSpace(cand), s) || strings.HasPrefix(strings.ToLower(cand), strings.ToLower(s)) {
				return s
			}
		}
	}
	return ""
}

// UpsertMeeting stores a meeting keyed by its calendar UID. Events that do not
// belong to one of the six series are ignored (returns false).
func UpsertMeeting(app core.App, in gcal.Event, userByEmail map[string]string) (bool, error) {
	seriesDesc, emails := parseDescription(in.Description)
	series := resolveSeries(in, seriesDesc)
	if series == "" || in.ExternalID == "" {
		return false, nil
	}

	rec, err := app.FindFirstRecordByFilter(org.ColMeetings, "external_id = {:id}", dbx.Params{"id": in.ExternalID})
	if err != nil {
		col, cerr := app.FindCollectionByNameOrId(org.ColMeetings)
		if cerr != nil {
			return false, cerr
		}
		rec = core.NewRecord(col)
		rec.Set("external_id", in.ExternalID)
	}

	var members []string
	if series == "Community" && len(emails) == 0 {
		for _, id := range userByEmail {
			members = append(members, id)
		}
	}
	for _, e := range emails {
		if id, ok := userByEmail[e]; ok {
			members = append(members, id)
		}
	}
	// Members added in the app aren't in the event description yet.
	for _, id := range appAddedMembers(app, series, in.Start) {
		if !slices.Contains(members, id) {
			members = append(members, id)
		}
	}

	rec.Set("title", in.Title)
	rec.Set("series", series)
	rec.Set("start_at", in.Start.UTC())
	rec.Set("end_at", in.End.UTC())
	rec.Set("location", in.Location)
	rec.Set("members", members)
	return true, app.Save(rec)
}

// usersByEmail maps roster members (users with a tier) by email.
func usersByEmail(app core.App) (map[string]string, error) {
	recs, err := app.FindRecordsByFilter(org.ColUsers, "tier != ''", "", 0, 0)
	if err != nil {
		return nil, err
	}
	m := make(map[string]string, len(recs))
	for _, r := range recs {
		m[strings.ToLower(r.Email())] = r.Id
	}
	return m, nil
}

// SyncCalendar pulls GOOGLE_CALENDAR_ID and upserts its events as meetings;
// future meetings no longer in the calendar are removed (with a Slack note).
func SyncCalendar(app core.App) (int, error) {
	events, err := gcal.Fetch(os.Getenv("GOOGLE_CALENDAR_ID"), os.Getenv("GOOGLE_CALENDAR_API_KEY"), time.Now().AddDate(0, -6, 0))
	if err != nil {
		return 0, err
	}
	users, err := usersByEmail(app)
	if err != nil {
		return 0, err
	}
	count := 0
	seen := map[string]bool{}
	for _, ev := range events {
		seen[ev.ExternalID] = true
		ok, err := UpsertMeeting(app, ev, users)
		if err != nil {
			return count, err
		}
		if ok {
			count++
		}
	}
	pruneRemovedMeetings(app, seen)
	return count, nil
}

// runSync is the scheduled sync; new or moved meetings reach Slack at once.
func runSync(app core.App) {
	n, err := SyncCalendar(app)
	if err != nil {
		slog.Warn("google calendar sync failed", "error", err)
		return
	}
	slog.Info("google calendar synced", "meetings", n)
	slack.NoticesNow(app)
}

// POST /api/team/calendar/sync — sync now (admins).
func handleCalendarSync(e *core.RequestEvent) error {
	n, err := SyncCalendar(e.App)
	if err != nil {
		return e.BadRequestError("Calendar sync failed: "+err.Error(), err)
	}
	slack.NoticesNow(e.App) // moved/new meetings show up in Slack at once
	return e.JSON(200, map[string]any{"synced": n})
}

// pruneRemovedMeetings deletes future meetings that are no longer in the
// calendar (deleted or cancelled there). Past meetings stay: attendance is
// attached to them. Runs only after a complete sync, so a failed page never
// wipes anything.
func pruneRemovedMeetings(app core.App, seen map[string]bool) {
	future, err := app.FindRecordsByFilter(org.ColMeetings, "start_at > {:now}", "", 0, 0, dbx.Params{"now": org.DBTime(time.Now())})
	if err != nil {
		return
	}
	for _, m := range future {
		if seen[m.GetString("external_id")] {
			continue
		}
		slack.MeetingCancelled(app, m)
		if err := app.Delete(m); err != nil {
			slog.Warn("calendar: remove meeting", "id", m.Id, "error", err)
		}
	}
}
