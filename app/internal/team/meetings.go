package team

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// MeetingInput is one calendar event, from Google Calendar or an .ics file.
type MeetingInput struct {
	ExternalID  string
	Title       string
	Description string
	Location    string
	Category    string
	Start, End  time.Time
}

var knownSeries = []string{"Summer School", "Grants", "Shape Talks", "Community", "Shapers Tech", "Shapers Voice"}

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

func resolveSeries(in MeetingInput, fromDesc string) string {
	for _, cand := range []string{fromDesc, in.Category, in.Title} {
		for _, s := range knownSeries {
			if strings.EqualFold(strings.TrimSpace(cand), s) || strings.HasPrefix(strings.ToLower(cand), strings.ToLower(s)) {
				return s
			}
		}
	}
	return ""
}

// UpsertMeeting stores a meeting keyed by its calendar UID. Events that do not
// belong to one of the six series are ignored (returns false).
func UpsertMeeting(app core.App, in MeetingInput, userByEmail map[string]string) (bool, error) {
	seriesDesc, emails := parseDescription(in.Description)
	series := resolveSeries(in, seriesDesc)
	if series == "" || in.ExternalID == "" {
		return false, nil
	}

	rec, err := app.FindFirstRecordByFilter(colMeetings, "external_id = {:id}", dbx.Params{"id": in.ExternalID})
	if err != nil {
		col, cerr := app.FindCollectionByNameOrId(colMeetings)
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
	recs, err := app.FindRecordsByFilter(colUsers, "tier != ''", "", 0, 0)
	if err != nil {
		return nil, err
	}
	m := make(map[string]string, len(recs))
	for _, r := range recs {
		m[strings.ToLower(r.Email())] = r.Id
	}
	return m, nil
}

// ---- Google Calendar (read-only, public calendar + API key) ----

type gcalEvent struct {
	ID          string `json:"id"`
	ICalUID     string `json:"iCalUID"`
	RecurringID string `json:"recurringEventId"`
	Status      string `json:"status"`
	Summary     string `json:"summary"`
	Description string `json:"description"`
	Location    string `json:"location"`
	Start       struct {
		DateTime time.Time `json:"dateTime"`
	} `json:"start"`
	End struct {
		DateTime time.Time `json:"dateTime"`
	} `json:"end"`
}

// SyncGoogleCalendar pulls all events from GOOGLE_CALENDAR_ID and upserts them.
func SyncGoogleCalendar(app core.App) (int, error) {
	calID, key := os.Getenv("GOOGLE_CALENDAR_ID"), os.Getenv("GOOGLE_CALENDAR_API_KEY")
	if calID == "" || key == "" {
		return 0, errors.New("GOOGLE_CALENDAR_ID and GOOGLE_CALENDAR_API_KEY must be set")
	}
	users, err := usersByEmail(app)
	if err != nil {
		return 0, err
	}

	client := &http.Client{Timeout: 20 * time.Second}
	count, pageToken := 0, ""
	seen := map[string]bool{}
	for {
		q := url.Values{
			"key":          {key},
			"singleEvents": {"true"},
			"orderBy":      {"startTime"},
			"maxResults":   {"2500"},
			"timeMin":      {time.Now().AddDate(0, -6, 0).Format(time.RFC3339)},
		}
		if pageToken != "" {
			q.Set("pageToken", pageToken)
		}
		endpoint := "https://www.googleapis.com/calendar/v3/calendars/" + url.PathEscape(calID) + "/events?" + q.Encode()
		resp, err := client.Get(endpoint)
		if err != nil {
			return count, err
		}
		var body struct {
			Items         []gcalEvent `json:"items"`
			NextPageToken string      `json:"nextPageToken"`
			Error         *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		err = json.NewDecoder(resp.Body).Decode(&body)
		resp.Body.Close()
		if err != nil {
			return count, err
		}
		if body.Error != nil {
			return count, fmt.Errorf("google: %s", body.Error.Message)
		}
		for _, ev := range body.Items {
			if ev.Status == "cancelled" || ev.Start.DateTime.IsZero() {
				continue
			}
			id := ev.ICalUID
			if ev.RecurringID != "" || id == "" {
				id = "gcal:" + ev.ID
			}
			seen[id] = true
			ok, err := UpsertMeeting(app, MeetingInput{
				ExternalID: id, Title: ev.Summary, Description: ev.Description,
				Location: ev.Location, Start: ev.Start.DateTime, End: ev.End.DateTime,
			}, users)
			if err != nil {
				return count, err
			}
			if ok {
				count++
			}
		}
		if body.NextPageToken == "" {
			pruneRemovedMeetings(app, seen)
			return count, nil
		}
		pageToken = body.NextPageToken
	}
}

// ---- Minimal .ics reader (sandbox file / offline fallback) ----

func ParseICS(data string) []MeetingInput {
	data = strings.ReplaceAll(data, "\r\n", "\n")
	data = strings.ReplaceAll(data, "\n ", "") // unfold continuation lines
	var out []MeetingInput
	var cur *MeetingInput
	for _, line := range strings.Split(data, "\n") {
		switch {
		case line == "BEGIN:VEVENT":
			cur = &MeetingInput{}
		case line == "END:VEVENT":
			if cur != nil {
				out = append(out, *cur)
			}
			cur = nil
		case cur != nil:
			name, value, ok := strings.Cut(line, ":")
			if !ok {
				continue
			}
			name, _, _ = strings.Cut(name, ";")
			value = strings.NewReplacer(`\,`, ",", `\;`, ";").Replace(value)
			switch name {
			case "UID":
				cur.ExternalID = value
			case "SUMMARY":
				cur.Title = value
			case "DESCRIPTION":
				cur.Description = value
			case "LOCATION":
				cur.Location = value
			case "CATEGORIES":
				cur.Category = value
			case "DTSTART":
				cur.Start, _ = time.Parse("20060102T150405Z", value)
			case "DTEND":
				cur.End, _ = time.Parse("20060102T150405Z", value)
			}
		}
	}
	return out
}

// pruneRemovedMeetings deletes future meetings that are no longer in the
// calendar (deleted or cancelled there). Past meetings stay: attendance is
// attached to them. Runs only after a complete sync, so a failed page never
// wipes anything.
func pruneRemovedMeetings(app core.App, seen map[string]bool) {
	future, err := app.FindRecordsByFilter(colMeetings, "start_at > {:now}", "", 0, 0, dbx.Params{"now": dbTime(time.Now())})
	if err != nil {
		return
	}
	for _, m := range future {
		if seen[m.GetString("external_id")] {
			continue
		}
		slackMeetingCancelled(app, m)
		if err := app.Delete(m); err != nil {
			slog.Warn("calendar: remove meeting", "id", m.Id, "error", err)
		}
	}
}
