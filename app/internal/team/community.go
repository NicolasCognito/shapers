package team

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/board"
	"github.com/xusenlin/workavera/internal/org"
)

// Tier rules from the organisers (email "članski nivoji", 24 Oct 2026):
//
//   - Pause: weeks on pause never count as behind and never break a streak
//     (pauses.go). Impact may pause up to 6 weeks a year, announced in
//     advance; GO! only briefly, with a reason for their buddy. Admins can
//     set a pause directly.
//   - Community meetings: GO! must attend in person; Impact may miss 3 a year,
//     never two in a row.
//   - Absence notice (GO!): Community 72 h ahead, project meetings 24 h ahead
//     (attendance_absence.go). A late notice counts as unexcused.
//   - Each missed Community meeting gives a GO! member a follow-up task due in
//     14 days: read the minutes and take a general task.

const (
	impactCommunityMisses = 3 // per year
	followUpDays          = 14
	generalProjectName    = "General"
)

type communityStats struct {
	Rule        string `json:"rule"` // "in_person" (GO!), "limit" (Impact), "" (no rule)
	Held        int    `json:"held"` // this year, pauses excluded
	Missed      int    `json:"missed"`
	Remote      int    `json:"remote"`
	Limit       int    `json:"limit,omitempty"`
	InARow      bool   `json:"in_a_row"`
	LateNotices int    `json:"late_notices"`
	Breach      bool   `json:"breach"`
}

func (ds *dataset) community(u *core.Record, now time.Time) *communityStats {
	c := &communityStats{}
	switch u.GetString("tier") {
	case org.TierGO:
		c.Rule = "in_person"
	case org.TierImpact:
		c.Rule, c.Limit = "limit", impactCommunityMisses
	}
	prevMissed := false
	for _, m := range ds.meetings { // sorted by start
		start := m.GetDateTime("start_at").Time()
		if m.GetString("series") != org.SeriesCommunity || !start.Before(now) || start.In(org.Location).Year() != now.In(org.Location).Year() {
			continue
		}
		if !slices.Contains(m.GetStringSlice("members"), u.Id) || inPause(ds.pauses[u.Id], start) {
			continue
		}
		key := m.Id + "|" + u.Id
		c.Held++
		st := ds.attendance[key]
		missed := st == "excused" || st == "unexcused"
		if missed {
			c.Missed++
			if prevMissed {
				c.InARow = true
			}
		}
		if st == "remote" {
			c.Remote++
		}
		if ds.late[key] {
			c.LateNotices++
		}
		prevMissed = missed
	}
	if c.Held == 0 {
		return nil
	}
	switch c.Rule {
	case "in_person":
		c.Breach = c.Missed > 0 || c.LateNotices > 0
	case "limit":
		c.Breach = c.Missed > c.Limit || c.InARow
	}
	return c
}

func registerCommunityRules(app core.App) {
	sync := func(e *core.RecordEvent) error {
		syncFollowUp(e.App, e.Record)
		return e.Next()
	}
	app.OnRecordAfterCreateSuccess(org.ColAttendance).BindFunc(sync)
	app.OnRecordAfterUpdateSuccess(org.ColAttendance).BindFunc(sync)
	app.OnRecordAfterDeleteSuccess(org.ColAttendance).BindFunc(func(e *core.RecordEvent) error {
		if id := e.Record.GetString("follow_up_task"); id != "" {
			removeOpenTask(e.App, id)
		}
		return e.Next()
	})
}

func syncFollowUp(app core.App, a *core.Record) {
	st := a.GetString("state")
	missed := st == "excused" || st == "unexcused"
	taskID := a.GetString("follow_up_task")
	if !missed {
		if taskID != "" { // they came after all
			removeOpenTask(app, taskID)
			a.Set("follow_up_task", "")
			_ = app.Save(a)
		}
		return
	}
	if taskID != "" || a.GetString("source") == "import" {
		return
	}
	u, err := org.FindUser(app, a.GetString("user"))
	if err != nil || u.GetString("tier") != org.TierGO {
		return
	}
	m, err := app.FindRecordById(org.ColMeetings, a.GetString("meeting"))
	if err != nil || m.GetString("series") != org.SeriesCommunity {
		return
	}
	start := m.GetDateTime("start_at").Time()
	if inPause(loadPauses(app, u.Id)[u.Id], start) {
		return
	}
	id, err := createFollowUpTask(app, u, m)
	if err != nil {
		slog.Warn("team: follow-up task", "error", err)
		return
	}
	a.Set("follow_up_task", id)
	_ = app.Save(a)
}

func removeOpenTask(app core.App, id string) {
	t, err := app.FindRecordById("board_tasks", id)
	if err != nil || isCompleted(app, t) {
		return
	}
	_ = app.Delete(t)
}

// generalProject finds or creates the project for everyday institute work.
func generalProject(app core.App) (*core.Record, error) {
	if p, err := app.FindFirstRecordByFilter("board_projects", "name = {:n}", dbx.Params{"n": generalProjectName}); err == nil {
		return p, nil
	}
	admin, err := app.FindFirstRecordByFilter(org.ColUsers, "is_admin = true && tier != ''")
	if err != nil {
		return nil, fmt.Errorf("no admin to own the %s project: %w", generalProjectName, err)
	}
	res, err := board.CreateProject(context.Background(), app, admin.Id, board.CreateProjectCommand{
		Name: generalProjectName, Description: "Everyday institute work, and follow-ups from missed Community meetings",
		States: []board.TemplateState{
			{Name: "To do", Color: "#94a3b8", Category: "pending"},
			{Name: "In progress", Color: "#3b82f6", Category: "active"},
			{Name: "Done", Color: "#22c55e", Category: "completed"},
		},
	})
	if err != nil {
		return nil, err
	}
	p, err := app.FindRecordById("board_projects", res.ID)
	if err != nil {
		return nil, err
	}
	return p, addEveryoneToProject(app, p)
}

func createFollowUpTask(app core.App, u, m *core.Record) (string, error) {
	p, err := generalProject(app)
	if err != nil {
		return "", err
	}
	if err := ensureMember(app, p.Id, p.GetString("owner"), u); err != nil {
		return "", err
	}
	st, err := app.FindFirstRecordByFilter("board_project_states", "project = {:p} && category = 'pending'", dbx.Params{"p": p.Id})
	if err != nil {
		return "", errors.New("General project has no to-do state")
	}
	start := m.GetDateTime("start_at").Time().In(org.Location)
	res, err := board.CreateTask(context.Background(), app, p.GetString("owner"), board.CreateTaskCommand{
		ProjectID: p.Id, StateID: st.Id, Priority: "medium",
		Title: fmt.Sprintf("Community follow-up (%s): read the minutes and take a general task", start.Format("2 Jan")),
		Description: fmt.Sprintf("You missed %s · %s on %s. GO! rule: within %d days read the minutes and take on one general task.",
			m.GetString("series"), m.GetString("title"), start.Format("Mon 2 Jan"), followUpDays),
		DueDate:     org.NoonUTC(start.AddDate(0, 0, followUpDays)),
		AssigneeIDs: []string{u.Id},
	})
	if err != nil {
		return "", err
	}
	return res.ID, nil
}
