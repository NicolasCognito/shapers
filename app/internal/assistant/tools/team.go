package tools

import (
	"context"
	"fmt"
	"time"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"

	workagent "github.com/xusenlin/workavera/internal/agent"
	"github.com/xusenlin/workavera/internal/org"
	"github.com/xusenlin/workavera/internal/team"
)

type teamEmptyInput struct{}

type teamLogHoursInput struct {
	Hours   float64 `json:"hours" description:"Hours worked, 0.25 to 24, e.g. 1.5"`
	Date    string  `json:"date,omitempty" description:"Day the work was done, YYYY-MM-DD; defaults to today"`
	Note    string  `json:"note,omitempty" description:"Short description of what was done"`
	Project string  `json:"project,omitempty" description:"Optional project name the hours belong to"`
}

type teamWhoIsBehindInput struct {
	MinAttendance float64 `json:"minAttendance,omitempty" description:"Attendance rate threshold between 0 and 1 below which a member is flagged; defaults to 0.7"`
}

type teamMemberInput struct {
	Query string `json:"query,omitempty" description:"Part of the member's name or email; omit for the current user"`
}

type teamAttendanceInput struct {
	Series string `json:"series,omitempty" description:"Optional meeting series name to filter by, e.g. Core or Impact"`
}

func newTeamMyWeekTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_my_week",
		"The current user's week: hours logged this week vs weekly quota and what is expected by today, weekly history, streak of weeks with the quota met, attendance stats, recent and upcoming meetings (next 14 days), and recently finished tasks. Use for questions like 'how am I doing', 'how many hours do I have', 'when is my next meeting'.",
		func(ctx context.Context, _ teamEmptyInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := team.MyWeek(app, actorID)
			return calendarToolResult(app, actorID, "team my week", result, err)
		},
	)
}

func newTeamLogHoursTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_log_hours",
		"Log volunteer hours for the current user only, for today or yesterday. Call it when the user says they worked some hours (e.g. 'I worked 2 hours on the website yesterday'). Resolve relative dates against the current time. For older dates use team_request_hours instead. Returns the new week total against the weekly quota. Before calling, if the user has not said it, ask in one short message for: what they worked on (the note) and, if it matters, which project; if they already said it, log right away.",
		func(ctx context.Context, input teamLogHoursInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			date := time.Now().In(org.Location)
			if input.Date != "" {
				parsed, err := time.ParseInLocation("2006-01-02", input.Date, org.Location)
				if err != nil {
					return fantasy.NewTextErrorResponse("date must be YYYY-MM-DD"), nil
				}
				date = parsed.Add(12 * time.Hour)
			}
			result, err := team.LogHours(app, actorID, date, input.Hours, normalizeEscapedText(input.Note), input.Project)
			return calendarToolResult(app, actorID, "team log hours", result, err)
		},
	)
}

type teamRequestHoursInput struct {
	Hours float64 `json:"hours" description:"Hours worked, 0.25 to 24"`
	Date  string  `json:"date" description:"Day the work was done, YYYY-MM-DD, older than yesterday"`
	Note  string  `json:"note" description:"What was done; required so admins can approve"`
}

func newTeamRequestHoursTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_request_hours",
		"Send the admins a request to log hours for a date older than yesterday (members cannot log those themselves). The admins approve or reject it on the Requests page. Before calling, if the user has not said it, ask in one short message for: the date, the hours and what they worked on (required: admins approve based on it).",
		func(ctx context.Context, input teamRequestHoursInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			date, err := time.ParseInLocation("2006-01-02", input.Date, org.Location)
			if err != nil {
				return fantasy.NewTextErrorResponse("date must be YYYY-MM-DD"), nil
			}
			rec, err := team.RequestHours(app, actorID, date.Add(12*time.Hour), input.Hours, normalizeEscapedText(input.Note))
			var result any
			if rec != nil {
				result = map[string]any{"ok": true, "id": rec.Id, "status": "pending", "date": input.Date, "hours": input.Hours}
			}
			return calendarToolResult(app, actorID, "team request hours", result, err)
		},
	)
}

func newTeamWhoIsBehindTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_who_is_behind",
		"Admin only. Members who are behind on hours this week (pro-rata against their quota), have low meeting attendance, or have unexcused absences, worst first, with reasons. Use for 'who is falling behind', 'who should I check in with'.",
		func(ctx context.Context, input teamWhoIsBehindInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := team.WhoIsBehind(app, actorID, input.MinAttendance)
			return calendarToolResult(app, actorID, "team who is behind", result, err)
		},
	)
}

func newTeamMemberTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_member_report",
		"Hours, quota, streak, attendance and finished-task count for one member found by name or email. Members can only look up themselves; admins can look up anyone. If several members match, returns candidates to ask the user about.",
		func(ctx context.Context, input teamMemberInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := team.MemberReport(app, actorID, input.Query)
			return calendarToolResult(app, actorID, "team member report", result, err)
		},
	)
}

func newTeamAttendanceTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_attendance",
		"Meeting attendance. For admins: attendance rate per meeting series and the most recent held meetings with who was absent without excuse. For members: their own attendance per series.",
		func(ctx context.Context, input teamAttendanceInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := team.AttendanceReport(app, actorID, input.Series)
			return calendarToolResult(app, actorID, "team attendance", result, err)
		},
	)
}

type teamDeleteHoursInput struct {
	LogID string `json:"logId,omitempty" description:"Exact hour entry ID returned by an earlier call of this tool; omit to look entries up first"`
	Date  string `json:"date,omitempty" description:"Day of the entry, YYYY-MM-DD; with no logId, lists that day's entries (or the 5 most recent when omitted)"`
}

func newTeamDeleteHoursTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_delete_hours",
		"Delete one of the current user's hour entries logged by mistake. First call it without logId (optionally with date) to list candidate entries with their IDs; if exactly one matches what the user described, call again with that logId. Deleting always pauses for user approval. If approval is denied, do not retry unless the user asks again.",
		func(ctx context.Context, input teamDeleteHoursInput, call fantasy.ToolCall) (fantasy.ToolResponse, error) {
			if input.LogID == "" {
				logs, err := team.FindMyHourLogs(app, actorID, input.Date)
				return calendarToolResult(app, actorID, "team find hours", map[string]any{"entries": logs, "next": "call again with the logId to delete"}, err)
			}
			rec, err := team.HourLogForDelete(app, actorID, input.LogID)
			if err != nil {
				return calendarToolResult(app, actorID, "team delete hours", nil, err)
			}
			v := team.ViewHourLog(rec)
			approved, err := workagent.RequireApproval(ctx, workagent.ApprovalRequest{
				ToolCallID: call.ID,
				ToolName:   call.Name,
				Title:      "Delete hours?",
				Summary:    fmt.Sprintf("Delete %.2g h logged on %s.", v.Hours, v.Date),
				Target:     map[string]any{"type": "hour_log", "id": v.ID, "name": v.Note},
				Details: []workagent.ApprovalDetail{
					{Label: "Date", Value: v.Date},
					{Label: "Hours", Value: fmt.Sprintf("%.2g", v.Hours)},
					{Label: "Note", Value: v.Note},
				},
				Presentation: workagent.ApprovalPresentation{
					ConfirmLabel:   "Delete",
					ConfirmVariant: "destructive",
					PendingMessage: "Deleting hours…",
					SuccessMessage: "Hours deleted.",
					DeniedMessage:  "Kept the hours.",
					FailureMessage: "The hours could not be deleted.",
				},
			})
			if err != nil {
				return fantasy.ToolResponse{}, err
			}
			if !approved {
				return calendarToolResult(app, actorID, "team delete hours", map[string]any{"ok": false, "reason": "user_denied", "entry": v}, nil)
			}
			if err := app.Delete(rec); err != nil {
				return calendarToolResult(app, actorID, "team delete hours", nil, err)
			}
			return calendarToolResult(app, actorID, "team delete hours", map[string]any{"ok": true, "deleted": v}, nil)
		},
	)
}

type teamListRequestsInput struct {
	Status string `json:"status,omitempty" description:"pending (default): waiting for a decision; decided: approved, rejected or withdrawn; all"`
	Type   string `json:"type,omitempty" description:"Optional: hours, pause or handoff"`
	Scope  string `json:"scope,omitempty" description:"Admins only: 'mine' for just their own and addressed-to-them requests; default shows every hours and pause request too"`
	Limit  int    `json:"limit,omitempty" description:"How many, newest first; default 20, max 50"`
}

func newTeamListRequestsTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_list_requests",
		"Requests from the Requests page (/requests): hours for older dates, pauses, task handoffs. Members see their own and those addressed to them; admins also see everyone's hours and pause requests. Use for 'what requests are waiting', 'did my request get approved', 'what did I reject last week', 'requests from Nina'. Returns total and the newest items with who asked, status, dates, hours, note and the decision with its reason.",
		func(ctx context.Context, input teamListRequestsInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := team.ListRequests(app, actorID, input.Status, input.Type, input.Scope, input.Limit)
			return calendarToolResult(app, actorID, "team list requests", result, err)
		},
	)
}
