package team

import (
	"log/slog"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

// Admins belong to every project, so they see all projects on one board.
// Other members are picked when the project is created ("Add everyone" in the
// form adds the whole roster). Board roles follow the team role.

func boardRoleFor(u *core.Record) string {
	if org.Can(u, org.PermTeamView) {
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
	users, err := app.FindRecordsByFilter(org.ColUsers, filter, "", 0, 0)
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
	app.OnRecordAfterCreateSuccess(org.ColUsers).BindFunc(func(e *core.RecordEvent) error {
		if !e.Record.GetBool("is_admin") {
			return e.Next()
		}
		if err := addUserToAllProjects(e.App, e.Record); err != nil {
			slog.Warn("team: add user to projects", "error", err)
		}
		return e.Next()
	})
}
