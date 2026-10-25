// Package gcal reads calendar events: from a public Google Calendar (API key,
// read-only) or from an .ics file. It knows nothing about meetings, members
// or the database; the team package turns events into meetings.
package gcal

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Event is one calendar event.
type Event struct {
	ExternalID  string // stable id: iCalUID, or "gcal:<id>" for recurring instances
	Title       string
	Description string
	Location    string
	Category    string // .ics CATEGORIES
	Start, End  time.Time
}

type apiEvent struct {
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

// Fetch returns all timed, non-cancelled events of a public calendar from
// `since` on. It fails as a whole: a partial result is never returned, so a
// caller may safely treat missing events as deleted.
func Fetch(calendarID, apiKey string, since time.Time) ([]Event, error) {
	if calendarID == "" || apiKey == "" {
		return nil, errors.New("GOOGLE_CALENDAR_ID and GOOGLE_CALENDAR_API_KEY must be set")
	}
	client := &http.Client{Timeout: 20 * time.Second}
	var out []Event
	pageToken := ""
	for {
		q := url.Values{
			"key":          {apiKey},
			"singleEvents": {"true"},
			"orderBy":      {"startTime"},
			"maxResults":   {"2500"},
			"timeMin":      {since.Format(time.RFC3339)},
		}
		if pageToken != "" {
			q.Set("pageToken", pageToken)
		}
		endpoint := "https://www.googleapis.com/calendar/v3/calendars/" + url.PathEscape(calendarID) + "/events?" + q.Encode()
		resp, err := client.Get(endpoint)
		if err != nil {
			return nil, err
		}
		var body struct {
			Items         []apiEvent `json:"items"`
			NextPageToken string     `json:"nextPageToken"`
			Error         *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		err = json.NewDecoder(resp.Body).Decode(&body)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}
		if body.Error != nil {
			return nil, fmt.Errorf("google: %s", body.Error.Message)
		}
		for _, ev := range body.Items {
			if ev.Status == "cancelled" || ev.Start.DateTime.IsZero() {
				continue
			}
			id := ev.ICalUID
			if ev.RecurringID != "" || id == "" {
				id = "gcal:" + ev.ID
			}
			out = append(out, Event{
				ExternalID: id, Title: ev.Summary, Description: ev.Description,
				Location: ev.Location, Start: ev.Start.DateTime, End: ev.End.DateTime,
			})
		}
		if body.NextPageToken == "" {
			return out, nil
		}
		pageToken = body.NextPageToken
	}
}

// ParseICS is a minimal .ics reader (sandbox file / offline fallback).
func ParseICS(data string) []Event {
	data = strings.ReplaceAll(data, "\r\n", "\n")
	data = strings.ReplaceAll(data, "\n ", "") // unfold continuation lines
	var out []Event
	var cur *Event
	for _, line := range strings.Split(data, "\n") {
		switch {
		case line == "BEGIN:VEVENT":
			cur = &Event{}
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
