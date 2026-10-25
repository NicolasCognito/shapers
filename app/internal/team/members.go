package team

import (
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

var memberTiers = []string{"Core", "Impact", "GO!"}

// POST /api/team/members — an admin adds a member: the account exists at once
// and the admin passes the password on. The member can change it in Profile.
func handleCreateMember(e *core.RequestEvent) error {
	var in struct {
		Name        string   `json:"name"`
		Email       string   `json:"email"`
		Password    string   `json:"password"`
		Tier        string   `json:"tier"`
		WeeklyHours float64  `json:"weekly_hours"`
		Admin       bool     `json:"is_admin"`
		Jarvis      bool     `json:"jarvis_enabled"`
		Series      []string `json:"series"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	in.Name, in.Email = strings.TrimSpace(in.Name), strings.ToLower(strings.TrimSpace(in.Email))
	switch {
	case in.Name == "":
		return e.BadRequestError("Name is required.", nil)
	case !strings.Contains(in.Email, "@"):
		return e.BadRequestError("A valid email is required.", nil)
	case len(in.Password) < 8:
		return e.BadRequestError("The password needs at least 8 characters.", nil)
	case !slices.Contains(memberTiers, in.Tier):
		return e.BadRequestError("Pick a tier: Core, Impact or GO!.", nil)
	}
	if _, err := e.App.FindAuthRecordByEmail(colUsers, in.Email); err == nil {
		return e.BadRequestError("Someone with this email is already a member.", nil)
	}
	var series []string
	for _, s := range in.Series {
		if slices.Contains(knownSeries, s) && s != "Community" && !slices.Contains(series, s) {
			series = append(series, s)
		}
	}
	if in.WeeklyHours <= 0 {
		in.WeeklyHours = typicalWeeklyHours(e.App, in.Tier)
	}

	col, err := e.App.FindCollectionByNameOrId(colUsers)
	if err != nil {
		return e.InternalServerError("", err)
	}
	u := core.NewRecord(col)
	u.SetEmail(in.Email)
	u.SetPassword(in.Password)
	u.SetVerified(true)
	u.Set("name", in.Name)
	u.Set("tier", in.Tier)
	u.Set("weekly_hours", in.WeeklyHours)
	u.Set("is_admin", in.Admin)
	u.Set("jarvis_enabled", in.Jarvis)
	u.Set("series", series)
	u.Set("added_by", e.Auth.Id)
	if err := e.App.Save(u); err != nil {
		return e.BadRequestError(err.Error(), err)
	}
	n := joinFutureMeetings(e.App, u)
	return e.JSON(200, map[string]any{"id": u.Id, "meetings": n})
}

// typicalWeeklyHours is the most common commitment among members of the tier.
func typicalWeeklyHours(app core.App, tier string) float64 {
	recs, _ := app.FindRecordsByFilter(colUsers, "tier = {:t}", "", 0, 0, dbx.Params{"t": tier})
	count := map[float64]int{}
	best, bestN := 0.0, 0
	for _, r := range recs {
		h := r.GetFloat("weekly_hours")
		if count[h]++; count[h] > bestN {
			best, bestN = h, count[h]
		}
	}
	return best
}

// inSeries: Community is everyone; other series come from the member's list.
func inSeries(u *core.Record, series string) bool {
	return series == "Community" || slices.Contains(u.GetStringSlice("series"), series)
}

// joinFutureMeetings adds a new member to upcoming meetings of their series.
func joinFutureMeetings(app core.App, u *core.Record) int {
	recs, err := app.FindRecordsByFilter(colMeetings, "start_at > {:now}", "", 0, 0, dbx.Params{"now": dbTime(time.Now())})
	if err != nil {
		return 0
	}
	n := 0
	for _, m := range recs {
		members := m.GetStringSlice("members")
		if !inSeries(u, m.GetString("series")) || slices.Contains(members, u.Id) {
			continue
		}
		m.Set("members", append(members, u.Id))
		if app.Save(m) == nil {
			n++
		}
	}
	return n
}

// appAddedMembers are members added in the app who belong to this series and
// already existed when the meeting starts. Calendar sync keeps them in.
func appAddedMembers(app core.App, series string, start time.Time) []string {
	recs, err := app.FindRecordsByFilter(colUsers, "added_by != '' && tier != ''", "", 0, 0)
	if err != nil {
		return nil
	}
	var ids []string
	for _, u := range recs {
		if inSeries(u, series) && u.GetDateTime("created").Time().Before(start) {
			ids = append(ids, u.Id)
		}
	}
	return ids
}

// POST /api/team/members/{id}/jarvis {"enabled": true} — show or hide the
// Jarvis button for a member.
func handleSetJarvis(e *core.RequestEvent) error {
	var in struct {
		Enabled bool `json:"enabled"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	u, err := e.App.FindRecordById(colUsers, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("Member not found.", err)
	}
	u.Set("jarvis_enabled", in.Enabled)
	if err := e.App.Save(u); err != nil {
		return e.BadRequestError(err.Error(), err)
	}
	return e.JSON(200, map[string]any{"jarvis_enabled": in.Enabled})
}
