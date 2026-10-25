package team

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/xusenlin/workavera/internal/board"
)

// Admins belong to every project, so they see all projects on one board.
// Other members are picked when the project is created ("Add everyone" in the
// form adds the whole roster). Board roles follow the team role.

func boardRoleFor(u *core.Record) string {
	if Can(u, PermTeamView) {
		return "admin"
	}
	return "member"
}

func ensureMember(app core.App, projectID, ownerID string, u *core.Record) error {
	if u.Id == ownerID || u.GetString("tier") == "" {
		return nil
	}
	_, err := app.FindFirstRecordByFilter("board_project_members", "project = {:p} && user = {:u}",
		dbx.Params{"p": projectID, "u": u.Id})
	if err == nil {
		return nil
	}
	col, err := app.FindCollectionByNameOrId("board_project_members")
	if err != nil {
		return err
	}
	rec := core.NewRecord(col)
	rec.Set("project", projectID)
	rec.Set("user", u.Id)
	rec.Set("role", boardRoleFor(u))
	return app.Save(rec)
}

func addEveryoneToProject(app core.App, project *core.Record) error {
	return addToProject(app, project, "tier != ''")
}

func addAdminsToProject(app core.App, project *core.Record) error {
	return addToProject(app, project, "tier != '' && is_admin = true")
}

func addToProject(app core.App, project *core.Record, filter string) error {
	users, err := app.FindRecordsByFilter(colUsers, filter, "", 0, 0)
	if err != nil {
		return err
	}
	for _, u := range users {
		if err := ensureMember(app, project.Id, project.GetString("owner"), u); err != nil {
			return err
		}
	}
	return nil
}

func addUserToAllProjects(app core.App, u *core.Record) error {
	projects, err := app.FindAllRecords("board_projects")
	if err != nil {
		return err
	}
	for _, p := range projects {
		if err := ensureMember(app, p.Id, p.GetString("owner"), u); err != nil {
			return err
		}
	}
	return nil
}

func registerProjectHooks(app core.App) {
	app.OnRecordAfterCreateSuccess("board_projects").BindFunc(func(e *core.RecordEvent) error {
		if err := addAdminsToProject(e.App, e.Record); err != nil {
			slog.Warn("team: add members to project", "error", err)
		}
		return e.Next()
	})
	// New admins join every project; new members are added to projects by hand.
	app.OnRecordAfterCreateSuccess(colUsers).BindFunc(func(e *core.RecordEvent) error {
		if !e.Record.GetBool("is_admin") {
			return e.Next()
		}
		if err := addUserToAllProjects(e.App, e.Record); err != nil {
			slog.Warn("team: add user to projects", "error", err)
		}
		return e.Next()
	})
}

// ---- Sandbox projects ----

// The sandbox promises "ten project names" but none were shipped; these are
// placeholders until the organisers send the real list.
var sandboxProjects = []struct {
	name, desc string
	tasks      []string
}{
	{"Summer School 2027", "Programme, venue and applications for next summer", []string{"Book the venue", "Draft programme outline", "Open applications form", "Invite three guest lecturers", "Budget v1"}},
	{"Erasmus+ grant", "KA2 partnership application", []string{"Find two partner organisations", "Write project rationale", "Budget table", "Collect letters of intent", "Submit before deadline"}},
	{"Shape Talks season", "Monthly public talks", []string{"Shortlist speakers", "Book Impact Hub event room", "Design poster template", "Set up registration page", "Record and publish talk #1"}},
	{"Community onboarding", "Make the first month easy for newcomers", []string{"Write welcome guide", "Buddy system pairs", "Onboarding checklist in Slack", "First-week coffee meetups"}},
	{"Website relaunch", "New site with events and team pages", []string{"Content inventory", "Pick a template", "Team page photos", "Events page from calendar", "Launch and announce"}},
	{"Shapers Voice podcast", "Monthly episode with members and alumni", []string{"Episode 1 guest", "Record intro jingle", "Publish on Spotify", "Write show notes"}},
	{"Shapers Tech platform", "Internal tools for the institute", []string{"Collect pain points from members", "Hackathon handover", "Set up hosting", "Train admins"}},
	{"Annual report 2026", "Numbers and stories from the year", []string{"Collect hours and attendance stats", "Interview five members", "Layout draft", "Board review"}},
	{"Partnerships", "Companies and NGOs we work with", []string{"Partner list update", "Meeting with Impact Hub", "Sponsorship deck", "Follow-up emails"}},
	{"Fundraising dinner", "Year-end event for supporters", []string{"Pick a date", "Guest list", "Catering offers", "Program and speakers"}},
}

func importProjects(app core.App, _ string) (int, error) {
	admin, err := app.FindFirstRecordByFilter(colUsers, "is_admin = true && tier != ''")
	if err != nil {
		return 0, fmt.Errorf("no admin to own projects: %w", err)
	}
	users, err := app.FindRecordsByFilter(colUsers, "tier != ''", "", 0, 0)
	if err != nil {
		return 0, err
	}
	rng := rand.New(rand.NewSource(42))
	ctx := context.Background()
	now := time.Now()
	priorities := []string{"none", "low", "medium", "medium", "high", "urgent"}
	n := 0
	for _, sp := range sandboxProjects {
		if _, err := app.FindFirstRecordByFilter("board_projects", "name = {:n}", dbx.Params{"n": sp.name}); err == nil {
			continue // already imported
		}
		res, err := board.CreateProject(ctx, app, admin.Id, board.CreateProjectCommand{
			Name: sp.name, Description: sp.desc,
			States: []board.TemplateState{
				{Name: "To do", Color: "#94a3b8", Category: "pending"},
				{Name: "In progress", Color: "#3b82f6", Category: "active"},
				{Name: "Done", Color: "#22c55e", Category: "completed"},
			},
		})
		if err != nil {
			return n, fmt.Errorf("%s: %w", sp.name, err)
		}
		project, err := app.FindRecordById("board_projects", res.ID)
		if err != nil {
			return n, err
		}
		if err := addEveryoneToProject(app, project); err != nil {
			return n, err
		}
		states, err := app.FindRecordsByFilter("board_project_states", "project = {:p}", "sort_order", 0, 0, dbx.Params{"p": res.ID})
		if err != nil || len(states) < 3 {
			return n, fmt.Errorf("%s: states missing", sp.name)
		}
		for i, title := range sp.tasks {
			// Earlier tasks in each list are more likely to be finished.
			stateIdx := 0
			switch r := rng.Float64(); {
			case i < 2 && r < 0.8, r < 0.3:
				stateIdx = 2
			case r < 0.6:
				stateIdx = 1
			}
			assignee := users[rng.Intn(len(users))].Id
			due := now.AddDate(0, 0, rng.Intn(28)-7).Format("2006-01-02") + " 12:00:00.000Z"
			task, err := board.CreateTask(ctx, app, admin.Id, board.CreateTaskCommand{
				ProjectID: res.ID, StateID: states[stateIdx].Id, Title: title,
				Priority: priorities[rng.Intn(len(priorities))], DueDate: due,
				AssigneeIDs: []string{assignee},
			})
			if err != nil {
				return n, fmt.Errorf("%s / %s: %w", sp.name, title, err)
			}
			if stateIdx == 2 {
				// Spread completions over the last six weeks for the analytics.
				done := now.AddDate(0, 0, -rng.Intn(42)).UTC().Format("2006-01-02 15:04:05.000Z")
				if _, err := app.DB().NewQuery("UPDATE board_tasks SET updated = {:d} WHERE id = {:id}").
					Bind(dbx.Params{"d": done, "id": task.ID}).Execute(); err != nil {
					return n, err
				}
			}
		}
		n++
	}
	return n, nil
}
