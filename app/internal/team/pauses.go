package team

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

const impactPauseDays = 42 // Impact: 6 weeks a year

type pausePeriod struct {
	ID    string    `json:"id"`
	Start time.Time `json:"start"` // first day, 00:00 organisation time
	End   time.Time `json:"end"`   // last day (inclusive), 00:00
	Note  string    `json:"note"`
}

func (p pausePeriod) until() time.Time { return p.End.AddDate(0, 0, 1) }

func (p pausePeriod) covers(t time.Time) bool {
	return !t.Before(p.Start) && t.Before(p.until())
}

func (p pausePeriod) overlaps(from, to time.Time) bool {
	return p.Start.Before(to) && from.Before(p.until())
}

// daysIn counts the pause's days that fall in the given year.
func (p pausePeriod) daysIn(year int) int {
	from := time.Date(year, 1, 1, 0, 0, 0, 0, org.Location)
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
		ID: r.Id, Start: org.DayOf(r.GetDateTime("start_date").Time()),
		End: org.DayOf(r.GetDateTime("end_date").Time()), Note: r.GetString("note"),
	}
}

// loadPauses returns pauses per user (all users when userID is empty).
func loadPauses(app core.App, userID string) map[string][]pausePeriod {
	filter := ""
	if userID != "" {
		filter = "user = {:u}"
	}
	recs, err := app.FindRecordsByFilter(org.ColPauses, filter, "start_date", 0, 0, dbx.Params{"u": userID})
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
	today := org.DayOf(now)
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
		if tier == org.TierGO {
			return errors.New("explain why you need the pause; your buddy and the admins will see it")
		}
		return errors.New("say why you need the pause")
	}
	today := org.DayOf(time.Now())
	if start.Before(today) {
		return errors.New("a pause can't start in the past; ask an admin to set it")
	}
	if tier == org.TierImpact {
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

// RequestPause: a member asks the admins for a pause.
func RequestPause(app core.App, actor *core.Record, start, end time.Time, note string) (*core.Record, error) {
	if err := checkPause(actor, loadPauses(app, actor.Id)[actor.Id], start, end, note, false); err != nil {
		return nil, err
	}
	r, err := newRequest(app, "pause", actor.Id)
	if err != nil {
		return nil, err
	}
	r.Set("date", org.NoonUTC(start))
	r.Set("end_date", org.NoonUTC(end))
	r.Set("note", strings.TrimSpace(note))
	return r, app.Save(r)
}

// SetPause (admins): put a member on pause directly, or on approving a request.
func SetPause(app core.App, actorID, userID string, start, end time.Time, note string) (*core.Record, error) {
	u, err := org.FindUser(app, userID)
	if err != nil {
		return nil, errors.New("member not found")
	}
	if err := checkPause(u, loadPauses(app, userID)[userID], start, end, note, true); err != nil {
		return nil, err
	}
	col, err := app.FindCollectionByNameOrId(org.ColPauses)
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Set("user", userID)
	r.Set("start_date", org.NoonUTC(start))
	r.Set("end_date", org.NoonUTC(end))
	r.Set("note", strings.TrimSpace(note))
	r.Set("created_by", actorID)
	return r, app.Save(r)
}

// readSpan reads {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "note": "..."}.
func readSpan(e *core.RequestEvent) (time.Time, time.Time, string, error) {
	var in struct {
		Start string `json:"start"`
		End   string `json:"end"`
		Note  string `json:"note"`
	}
	if err := e.BindBody(&in); err != nil {
		return time.Time{}, time.Time{}, "", errors.New("invalid body")
	}
	s, err := org.ParseDay(in.Start)
	if err != nil {
		return s, s, "", err
	}
	end, err := org.ParseDay(in.End)
	return s, end, in.Note, err
}

// POST /api/team/requests/pause — a member asks for a pause.
func handleRequestPause(e *core.RequestEvent) error {
	s, end, note, err := readSpan(e)
	if err != nil {
		return e.BadRequestError(err.Error(), nil)
	}
	rec, err := RequestPause(e.App, e.Auth, s, end, note)
	return replyRecord(e, rec, err)
}

// POST /api/team/members/{id}/pauses — an admin sets a pause directly.
func handleSetPause(e *core.RequestEvent) error {
	s, end, note, err := readSpan(e)
	if err != nil {
		return e.BadRequestError(err.Error(), nil)
	}
	rec, err := SetPause(e.App, e.Auth.Id, e.Request.PathValue("id"), s, end, note)
	return replyRecord(e, rec, err)
}

// DELETE /api/team/pauses/{id}
func handleDeletePause(e *core.RequestEvent) error {
	r, err := e.App.FindRecordById(org.ColPauses, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("Pause not found.", nil)
	}
	if err := e.App.Delete(r); err != nil {
		return e.InternalServerError("", err)
	}
	return e.JSON(200, map[string]any{"ok": true})
}
