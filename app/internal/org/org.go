// Package org holds what every Shapers feature shares: the organisation's
// timezone and calendar helpers, collection names, roles and permissions,
// and organisation-wide settings. It imports no other internal package, so
// any package may depend on it.
package org

import (
	"errors"
	"os"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// PocketBase collections owned by the Shapers features (schema in migrations/).
const (
	ColUsers         = "users"
	ColMeetings      = "meetings"
	ColAttendance    = "attendance"
	ColHourLogs      = "hour_logs"
	ColRequests      = "requests"
	ColPauses        = "pauses"
	ColTimers        = "work_timers"
	ColTrees         = "trees"
	ColSlackPosts    = "slack_posts"
	ColSlackActivity = "slack_activity"
	ColConfigs       = "configs"
)

// Member tiers and meeting series, as the organisers define them.
const (
	TierCore        = "Core"
	TierImpact      = "Impact"
	TierGO          = "GO!"
	SeriesCommunity = "Community" // everyone attends; no member list needed
)

var (
	Tiers  = []string{TierCore, TierImpact, TierGO}
	Series = []string{"Summer School", "Grants", "Shape Talks", SeriesCommunity, "Shapers Tech", "Shapers Voice"}
)

// Location is the organisation's timezone; weeks start on Monday here.
var Location = mustLoadLocation("Europe/Ljubljana")

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

// WeekStart returns Monday 00:00 (organisation time) of the week containing t.
func WeekStart(t time.Time) time.Time {
	t = t.In(Location)
	offset := (int(t.Weekday()) + 6) % 7
	d := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, Location)
	return d.AddDate(0, 0, -offset)
}

// DayOf returns 00:00 organisation time of t's day.
func DayOf(t time.Time) time.Time {
	t = t.In(Location)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, Location)
}

// DBTime formats t the way PocketBase stores datetimes (UTC).
func DBTime(t time.Time) string { return t.UTC().Format("2006-01-02 15:04:05.000Z") }

// NoonUTC stores a calendar day the way the rest of the app does (12:00 local).
func NoonUTC(day time.Time) string { return DBTime(DayOf(day).Add(12 * time.Hour)) }

// ParseDay reads YYYY-MM-DD in organisation time.
func ParseDay(s string) (time.Time, error) {
	d, err := time.ParseInLocation("2006-01-02", s, Location)
	if err != nil {
		return time.Time{}, errors.New("dates must be YYYY-MM-DD")
	}
	return d, nil
}

// FindUser loads a user record by id.
func FindUser(app core.App, id string) (*core.Record, error) {
	return app.FindRecordById(ColUsers, id)
}

// CheckinURL is the link behind a meeting's QR code (frontend pages/checkin.tsx).
func CheckinURL(base, meetingID string) string {
	return strings.TrimRight(base, "/") + "/checkin/" + meetingID
}

// PublicURL is the app's public address from the environment ("" if unset).
func PublicURL() string { return strings.TrimRight(os.Getenv("PUBLIC_URL"), "/") }
