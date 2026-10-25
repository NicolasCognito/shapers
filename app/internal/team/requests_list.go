package team

import (
	"errors"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

// RequestItem is one request as Jarvis sees it.
type RequestItem struct {
	ID           string  `json:"id"`
	Type         string  `json:"type"`
	Status       string  `json:"status"`
	Requester    string  `json:"requester"`
	Recipient    string  `json:"recipient,omitempty"`
	Date         string  `json:"date,omitempty"`
	EndDate      string  `json:"end_date,omitempty"`
	Hours        float64 `json:"hours,omitempty"`
	Task         string  `json:"task,omitempty"`
	Note         string  `json:"note,omitempty"`
	DecisionNote string  `json:"decision_note,omitempty"`
	DecidedBy    string  `json:"decided_by,omitempty"`
	Created      string  `json:"created"`
	DecidedAt    string  `json:"decided_at,omitempty"`
}

// ListRequests returns requests the actor may see, newest first, with the
// same visibility as the Requests page: own and addressed-to-me for
// everyone, plus all hours and pause requests for admins.
// status: pending | decided (approved/rejected/withdrawn) | all.
// scope: "mine" limits admins to their own and addressed-to-them requests.
func ListRequests(app core.App, actorID, status, typ, scope string, limit int) (map[string]any, error) {
	actor, err := app.FindRecordById(org.ColUsers, actorID)
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	visible := "(requester = {:me} || recipient = {:me})"
	if scope != "mine" && org.Can(actor, org.PermHoursManage) {
		visible = "(requester = {:me} || recipient = {:me} || type = 'hours' || type = 'pause')"
	}
	filter := []string{visible}
	switch status {
	case "", "pending":
		filter = append(filter, "status = 'pending'")
	case "decided":
		filter = append(filter, "status != 'pending'")
	case "all":
	default:
		return nil, errors.New("status must be pending, decided or all")
	}
	if typ != "" {
		filter = append(filter, "type = {:type}")
	}
	params := dbx.Params{"me": actorID, "type": typ}
	where := strings.Join(filter, " && ")
	recs, err := app.FindRecordsByFilter(org.ColRequests, where, "-created", limit, 0, params)
	if err != nil {
		return nil, err
	}
	total := len(recs)
	if total == limit {
		if all, err := app.FindRecordsByFilter(org.ColRequests, where, "", 0, 0, params); err == nil {
			total = len(all)
		}
	}
	names := map[string]string{}
	name := func(id string) string {
		if id == "" {
			return ""
		}
		if n, ok := names[id]; ok {
			return n
		}
		n := id
		if u, err := app.FindRecordById(org.ColUsers, id); err == nil {
			n = u.GetString("name")
		}
		names[id] = n
		return n
	}
	day := func(r *core.Record, f string) string {
		if t := r.GetDateTime(f).Time(); !t.IsZero() {
			return t.In(org.Location).Format("2006-01-02")
		}
		return ""
	}
	items := make([]RequestItem, 0, len(recs))
	for _, r := range recs {
		it := RequestItem{
			ID: r.Id, Type: r.GetString("type"), Status: r.GetString("status"),
			Requester: name(r.GetString("requester")), Recipient: name(r.GetString("recipient")),
			Date: day(r, "date"), EndDate: day(r, "end_date"), Hours: r.GetFloat("hours"),
			Note: r.GetString("note"), DecisionNote: r.GetString("decision_note"),
			DecidedBy: name(r.GetString("decided_by")),
			Created:   r.GetDateTime("created").Time().In(org.Location).Format(time.DateTime),
		}
		if t := r.GetDateTime("decided_at").Time(); !t.IsZero() {
			it.DecidedAt = t.In(org.Location).Format(time.DateTime)
		}
		if id := r.GetString("task"); id != "" {
			if task, err := app.FindRecordById("board_tasks", id); err == nil {
				it.Task = task.GetString("title")
			}
		}
		items = append(items, it)
	}
	return map[string]any{"total": total, "shown": len(items), "requests": items, "page": "/requests"}, nil
}
