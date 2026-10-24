package team

import (
	"log/slog"

	"github.com/pocketbase/dbx"

	"github.com/pocketbase/pocketbase/core"
)

// completedTasks counts board tasks in a "completed" state per assignee and
// the most recent completion time (task.updated).
func completedTasks(app core.App) (map[string]int, map[string]string) {
	var rows []struct {
		User string `db:"user"`
		N    int    `db:"n"`
		Last string `db:"last"`
	}
	err := app.DB().NewQuery(`
		SELECT a.value AS user, COUNT(*) AS n, MAX(t.updated) AS last
		FROM board_tasks t
		JOIN board_project_states s ON s.id = t.state
		JOIN json_each(CASE WHEN json_valid(t.assignees) THEN t.assignees ELSE '[]' END) a
		WHERE s.category = 'completed'
		GROUP BY a.value`).All(&rows)
	done, last := map[string]int{}, map[string]string{}
	if err != nil {
		slog.Warn("team: completed tasks query failed", "error", err)
		return done, last
	}
	for _, r := range rows {
		done[r.User], last[r.User] = r.N, r.Last
	}
	return done, last
}

type doneTask struct {
	ID      string `db:"id" json:"id"`
	Title   string `db:"title" json:"title"`
	Project string `db:"project" json:"project"`
	DoneAt  string `db:"done_at" json:"done_at"`
}

// completedTaskList returns a member's finished tasks, newest first.
func completedTaskList(app core.App, userID string) []doneTask {
	rows := []doneTask{}
	err := app.DB().NewQuery(`
		SELECT t.id, t.title, p.name AS project, t.updated AS done_at
		FROM board_tasks t
		JOIN board_project_states s ON s.id = t.state
		JOIN board_projects p ON p.id = t.project
		JOIN json_each(CASE WHEN json_valid(t.assignees) THEN t.assignees ELSE '[]' END) a
		WHERE s.category = 'completed' AND a.value = {:u}
		ORDER BY t.updated DESC LIMIT 50`).Bind(dbx.Params{"u": userID}).All(&rows)
	if err != nil {
		slog.Warn("team: completed task list", "error", err)
	}
	return rows
}
