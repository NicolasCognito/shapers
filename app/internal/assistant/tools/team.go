package tools

import (
	"context"
	"time"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"

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
		"Log volunteer hours for the current user only. Call it when the user says they worked some hours (e.g. 'I worked 2 hours on the website yesterday'). Resolve relative dates against the current time. Returns the new week total against the weekly quota.",
		func(ctx context.Context, input teamLogHoursInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			date := time.Now().In(team.Location)
			if input.Date != "" {
				parsed, err := time.ParseInLocation("2006-01-02", input.Date, team.Location)
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
