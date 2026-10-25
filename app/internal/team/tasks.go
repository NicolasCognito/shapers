package team

import (
	"errors"
	"log/slog"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

func isCompleted(app core.App, task *core.Record) bool {
	st, err := app.FindRecordById("board_project_states", task.GetString("state"))
	return err == nil && st.GetString("category") == "completed"
}

// CancelTask: an admin takes a finished task off someone's record. The task
// stays (shown struck through) but no longer counts as done.
func CancelTask(app core.App, actor *core.Record, taskID, reason string) (*core.Record, error) {
	if !org.Can(actor, org.PermTasksModerate) {
		return nil, errors.New("only admins can cancel finished tasks")
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return nil, errors.New("write a reason, the member will see it")
	}
	task, err := app.FindRecordById("board_tasks", taskID)
	if err != nil {
		return nil, errors.New("task not found")
	}
	if !isCompleted(app, task) {
		return nil, errors.New("only finished tasks can be cancelled")
	}
	task.Set("cancelled", true)
	task.Set("cancel_reason", reason)
	task.Set("cancelled_by", actor.Id)
	return task, app.Save(task)
}

// RestoreTask: an admin undoes a cancel; the task counts as done again.
func RestoreTask(app core.App, actor *core.Record, taskID string) (*core.Record, error) {
	if !org.Can(actor, org.PermTasksModerate) {
		return nil, errors.New("only admins can restore tasks")
	}
	task, err := app.FindRecordById("board_tasks", taskID)
	if err != nil {
		return nil, errors.New("task not found")
	}
	task.Set("cancelled", false)
	task.Set("cancel_reason", "")
	task.Set("cancelled_by", "")
	return task, app.Save(task)
}

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
		WHERE s.category = 'completed' AND COALESCE(t.cancelled, 0) = 0
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
	ID           string `db:"id" json:"id"`
	Title        string `db:"title" json:"title"`
	Project      string `db:"project" json:"project"`
	DoneAt       string `db:"done_at" json:"done_at"`
	Cancelled    bool   `db:"cancelled" json:"cancelled"`
	CancelReason string `db:"cancel_reason" json:"cancel_reason"`
}

// completedTaskList returns a member's finished tasks, newest first.
func completedTaskList(app core.App, userID string) []doneTask {
	rows := []doneTask{}
	err := app.DB().NewQuery(`
		SELECT t.id, t.title, p.name AS project, t.updated AS done_at,
		       COALESCE(t.cancelled, 0) AS cancelled, COALESCE(t.cancel_reason, '') AS cancel_reason
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

// registerTaskHooks: every task has an owner, the creator unless set otherwise.
func registerTaskHooks(app core.App) {
	app.OnRecordCreate("board_tasks").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("owner") == "" {
			owner := e.Record.GetString("created_by")
			if owner == "" && len(e.Record.GetStringSlice("assignees")) > 0 {
				owner = e.Record.GetStringSlice("assignees")[0]
			}
			e.Record.Set("owner", owner)
		}
		return e.Next()
	})
}

// POST /api/team/tasks/{id}/cancel {"reason": "..."}
func handleCancelTask(e *core.RequestEvent) error {
	var in struct {
		Reason string `json:"reason"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	rec, err := CancelTask(e.App, e.Auth, e.Request.PathValue("id"), in.Reason)
	return replyRecord(e, rec, err)
}

// POST /api/team/tasks/{id}/restore
func handleRestoreTask(e *core.RequestEvent) error {
	rec, err := RestoreTask(e.App, e.Auth, e.Request.PathValue("id"))
	return replyRecord(e, rec, err)
}
