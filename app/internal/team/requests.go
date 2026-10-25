package team

import (
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

func newRequest(app core.App, typ, requester string) (*core.Record, error) {
	col, err := app.FindCollectionByNameOrId(org.ColRequests)
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Set("type", typ)
	r.Set("status", "pending")
	r.Set("requester", requester)
	return r, nil
}

// RequestHours asks the admins to log hours for an older date.
func RequestHours(app core.App, actorID string, date time.Time, hours float64, note string) (*core.Record, error) {
	if hours < 0.25 || hours > 24 {
		return nil, errors.New("hours must be between 0.25 and 24")
	}
	if date.After(time.Now()) {
		return nil, errors.New("cannot request hours for a future date")
	}
	if selfLogAllowed(date) {
		return nil, errors.New("today and yesterday you can log hours yourself, no request needed")
	}
	if strings.TrimSpace(note) == "" {
		return nil, errors.New("say what you worked on, so the admins can approve it")
	}
	r, err := newRequest(app, "hours", actorID)
	if err != nil {
		return nil, err
	}
	r.Set("date", org.DBTime(date))
	r.Set("hours", hours)
	r.Set("note", strings.TrimSpace(note))
	return r, app.Save(r)
}

// RequestHandoff: the task owner asks another member to take the task over.
func RequestHandoff(app core.App, actorID, taskID, toID string) (*core.Record, error) {
	task, err := app.FindRecordById("board_tasks", taskID)
	if err != nil {
		return nil, errors.New("task not found")
	}
	switch {
	case task.GetString("owner") != actorID:
		return nil, errors.New("only the task owner can hand it over")
	case task.GetBool("cancelled") || isCompleted(app, task):
		return nil, errors.New("only open tasks can be handed over")
	case task.GetString("handoff_to") != "":
		return nil, errors.New("this task is already waiting for an answer; withdraw that request first")
	case toID == actorID:
		return nil, errors.New("you already own this task")
	}
	if _, err := app.FindRecordById(org.ColUsers, toID); err != nil {
		return nil, errors.New("recipient not found")
	}
	r, err := newRequest(app, "handoff", actorID)
	if err != nil {
		return nil, err
	}
	r.Set("recipient", toID)
	r.Set("task", taskID)
	return r, app.RunInTransaction(func(tx core.App) error {
		if err := tx.Save(r); err != nil {
			return err
		}
		task.Set("handoff_to", toID)
		return tx.Save(task)
	})
}

// DecideRequest approves or rejects a pending request. Hours requests are
// decided by admins (a reason is required to reject), handoffs by the recipient.
func DecideRequest(app core.App, actor *core.Record, id string, approve bool, note string) (*core.Record, error) {
	r, err := app.FindRecordById(org.ColRequests, id)
	if err != nil {
		return nil, errors.New("request not found")
	}
	if r.GetString("status") != "pending" {
		return nil, errors.New("this request is already " + r.GetString("status"))
	}
	note = strings.TrimSpace(note)
	switch r.GetString("type") {
	case "hours":
		if !org.Can(actor, org.PermHoursManage) {
			return nil, errors.New("only admins decide hour requests")
		}
		if !approve && note == "" {
			return nil, errors.New("write a reason, the member will see it")
		}
	case "pause":
		if !org.Can(actor, org.PermMembersManage) {
			return nil, errors.New("only admins decide pause requests")
		}
		if !approve && note == "" {
			return nil, errors.New("write a reason, the member will see it")
		}
	case "handoff":
		if r.GetString("recipient") != actor.Id {
			return nil, errors.New("only the person the task is offered to can answer")
		}
	}
	r.Set("status", map[bool]string{true: "approved", false: "rejected"}[approve])
	r.Set("decision_note", note)
	r.Set("decided_by", actor.Id)
	r.Set("decided_at", org.DBTime(time.Now()))

	return r, app.RunInTransaction(func(tx core.App) error {
		switch r.GetString("type") {
		case "hours":
			if approve {
				col, err := tx.FindCollectionByNameOrId(org.ColHourLogs)
				if err != nil {
					return err
				}
				log := core.NewRecord(col)
				log.Set("user", r.GetString("requester"))
				log.Set("date", r.GetDateTime("date"))
				log.Set("hours", r.GetFloat("hours"))
				log.Set("note", r.GetString("note"))
				log.Set("source", "request")
				if err := tx.Save(log); err != nil {
					return err
				}
			}
		case "pause":
			if approve {
				if _, err := SetPause(tx, actor.Id, r.GetString("requester"), org.DayOf(r.GetDateTime("date").Time()),
					org.DayOf(r.GetDateTime("end_date").Time()), r.GetString("note")); err != nil {
					return err
				}
			}
		case "handoff":
			task, err := tx.FindRecordById("board_tasks", r.GetString("task"))
			if err != nil {
				return errors.New("the task no longer exists")
			}
			task.Set("handoff_to", "")
			if approve {
				from, to := r.GetString("requester"), r.GetString("recipient")
				if task.GetString("owner") != from || task.GetBool("cancelled") || isCompleted(tx, task) {
					return errors.New("the task changed meanwhile and can no longer be handed over")
				}
				task.Set("owner", to)
				assignees := slices.DeleteFunc(task.GetStringSlice("assignees"), func(u string) bool { return u == from || u == to })
				task.Set("assignees", append(assignees, to))
			}
			if err := tx.Save(task); err != nil {
				return err
			}
		}
		return tx.Save(r)
	})
}

// WithdrawRequest lets the requester take back a pending request.
func WithdrawRequest(app core.App, actorID, id string) (*core.Record, error) {
	r, err := app.FindRecordById(org.ColRequests, id)
	if err != nil || r.GetString("requester") != actorID {
		return nil, errors.New("request not found")
	}
	if r.GetString("status") != "pending" {
		return nil, errors.New("this request is already " + r.GetString("status"))
	}
	r.Set("status", "withdrawn")
	return r, app.RunInTransaction(func(tx core.App) error {
		if r.GetString("type") == "handoff" {
			if task, err := tx.FindRecordById("board_tasks", r.GetString("task")); err == nil {
				task.Set("handoff_to", "")
				if err := tx.Save(task); err != nil {
					return err
				}
			}
		}
		return tx.Save(r)
	})
}

// POST /api/team/requests/hours {"date": "YYYY-MM-DD", "hours": 2, "note": "..."}
func handleRequestHours(e *core.RequestEvent) error {
	var in struct {
		Date  string  `json:"date"`
		Hours float64 `json:"hours"`
		Note  string  `json:"note"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	d, err := org.ParseDay(in.Date)
	if err != nil {
		return e.BadRequestError("date must be YYYY-MM-DD", nil)
	}
	rec, err := RequestHours(e.App, e.Auth.Id, d.Add(12*time.Hour), in.Hours, in.Note)
	return replyRecord(e, rec, err)
}

// POST /api/team/requests/handoff {"task": "...", "to": "..."}
func handleRequestHandoff(e *core.RequestEvent) error {
	var in struct{ Task, To string }
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	rec, err := RequestHandoff(e.App, e.Auth.Id, in.Task, in.To)
	return replyRecord(e, rec, err)
}

// POST /api/team/requests/{id}/decide {"approve": true, "note": "..."}
func handleDecideRequest(e *core.RequestEvent) error {
	var in struct {
		Approve bool   `json:"approve"`
		Note    string `json:"note"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	rec, err := DecideRequest(e.App, e.Auth, e.Request.PathValue("id"), in.Approve, in.Note)
	return replyRecord(e, rec, err)
}

// POST /api/team/requests/{id}/withdraw
func handleWithdrawRequest(e *core.RequestEvent) error {
	rec, err := WithdrawRequest(e.App, e.Auth.Id, e.Request.PathValue("id"))
	return replyRecord(e, rec, err)
}
