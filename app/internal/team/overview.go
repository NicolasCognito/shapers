package team

import (
	"slices"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// GET /api/team/me — everything the member dashboard needs.
func handleMe(e *core.RequestEvent) error {
	ds, err := loadDataset(e.App)
	if err != nil {
		return e.InternalServerError("", err)
	}
	return e.JSON(200, memberDetail(e.App, ds, e.Auth, time.Now()))
}

func memberDetail(app core.App, ds *dataset, u *core.Record, now time.Time) map[string]any {
	var past, upcoming []meetingView
	for _, m := range ds.meetings {
		if !slices.Contains(m.GetStringSlice("members"), u.Id) {
			continue
		}
		key := m.Id + "|" + u.Id
		v := toView(m, ds.attendance[key], now)
		v.Notice, v.Late = ds.notice[key], ds.late[key]
		if v.Start.Before(now) {
			past = append(past, v)
		} else if v.Start.Before(now.AddDate(0, 0, 14)) {
			upcoming = append(upcoming, v)
		}
	}
	slices.Reverse(past)
	return map[string]any{
		"summary":    ds.summary(u, now),
		"past":       past,
		"upcoming":   upcoming,
		"tasks_done": completedTaskList(app, u.Id),
		"pauses":     pausesOrEmpty(ds.pauses[u.Id]),
	}
}

// GET /api/team/overview — admin analytics across members, tiers, series and weeks.
func handleOverview(e *core.RequestEvent) error {
	ds, err := loadDataset(e.App)
	if err != nil {
		return e.InternalServerError("", err)
	}
	now := time.Now()
	members := make([]memberSummary, 0, len(ds.users))
	for _, u := range ds.users {
		members = append(members, ds.summary(u, now))
	}

	// Organisation-level weekly totals.
	type weekAgg struct {
		WeekStart string  `json:"week_start"`
		Hours     float64 `json:"hours"`
		Quota     float64 `json:"quota"`
		MetCount  int     `json:"met_count"`
	}
	weeks := make([]weekAgg, len(ds.weeks))
	for i, w := range ds.weeks {
		weeks[i].WeekStart = w.Format("2006-01-02")
		for _, m := range members {
			weeks[i].Hours += m.Weeks[i].Hours
			if !m.Weeks[i].Paused {
				weeks[i].Quota += m.Weeks[i].Quota
			}
			if m.Weeks[i].Met {
				weeks[i].MetCount++
			}
		}
	}

	// Per-series attendance over time (each held meeting).
	type meetingAgg struct {
		ID      string          `json:"id"`
		Title   string          `json:"title"`
		Series  string          `json:"series"`
		Start   time.Time       `json:"start"`
		Members int             `json:"members"`
		Stats   attendanceStats `json:"stats"`
	}
	var held []meetingAgg
	seriesStats := map[string]*attendanceStats{}
	for _, m := range ds.meetings {
		start := m.GetDateTime("start_at").Time()
		if !start.Before(now) {
			continue
		}
		agg := meetingAgg{ID: m.Id, Title: m.GetString("title"), Series: m.GetString("series"), Start: start}
		for _, uid := range m.GetStringSlice("members") {
			agg.Members++
			agg.Stats.add(ds.attendance[m.Id+"|"+uid])
			if seriesStats[agg.Series] == nil {
				seriesStats[agg.Series] = &attendanceStats{}
			}
			seriesStats[agg.Series].add(ds.attendance[m.Id+"|"+uid])
		}
		agg.Stats.finish()
		held = append(held, agg)
	}
	for _, s := range seriesStats {
		s.finish()
	}

	// Per-tier averages.
	type tierAgg struct {
		Tier        string  `json:"tier"`
		Members     int     `json:"members"`
		AvgProgress float64 `json:"avg_progress"`
		AvgAttend   float64 `json:"avg_attendance"`
		BehindCount int     `json:"behind_count"`
	}
	tiers := map[string]*tierAgg{}
	for _, m := range members {
		t := tiers[m.Tier]
		if t == nil {
			t = &tierAgg{Tier: m.Tier}
			tiers[m.Tier] = t
		}
		t.Members++
		t.AvgProgress += m.Progress
		t.AvgAttend += m.Attendance.Rate
		if m.Behind {
			t.BehindCount++
		}
	}
	tierList := []tierAgg{}
	for _, name := range []string{"Core", "Impact", "GO!"} {
		if t := tiers[name]; t != nil {
			t.AvgProgress /= float64(t.Members)
			t.AvgAttend /= float64(t.Members)
			tierList = append(tierList, *t)
		}
	}

	return e.JSON(200, map[string]any{
		"generated_at": now,
		"week_start":   ds.weeks[len(ds.weeks)-1].Format("2006-01-02"),
		"members":      members,
		"weeks":        weeks,
		"meetings":     held,
		"series":       seriesStats,
		"tiers":        tierList,
	})
}

// GET /api/team/members/{id} — admin drill-down into one member's history.
func handleMember(e *core.RequestEvent) error {
	ds, err := loadDataset(e.App)
	if err != nil {
		return e.InternalServerError("", err)
	}
	id := e.Request.PathValue("id")
	for _, u := range ds.users {
		if u.Id == id {
			return e.JSON(200, memberDetail(e.App, ds, u, time.Now()))
		}
	}
	return e.NotFoundError("Member not found.", nil)
}

func pausesOrEmpty(ps []pausePeriod) []pausePeriod {
	if ps == nil {
		return []pausePeriod{}
	}
	return ps
}
