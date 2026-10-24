package tools

import (
	"context"
	"time"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"

	"github.com/xusenlin/workavera/internal/team"
)

// Jarvis tools for meeting check-in, absence notices and pauses.

type teamMeetingInput struct {
	MeetingID string `json:"meetingId" description:"Meeting ID from team_my_week (upcoming or past meetings)"`
	Reason    string `json:"reason,omitempty" description:"Why the user can't come; required for an absence notice"`
	Remote    bool   `json:"remote,omitempty" description:"For check-in: true when joining remotely"`
}

type teamPauseInput struct {
	Start  string `json:"start" description:"First day of the pause, YYYY-MM-DD"`
	End    string `json:"end" description:"Last day of the pause, YYYY-MM-DD"`
	Reason string `json:"reason" description:"Why the user needs the pause (e.g. exam period)"`
}

func actorRecord(app core.App, id string) (*core.Record, error) {
	return app.FindRecordById("users", id)
}

func newTeamCheckInTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_check_in",
		"Clock the current user in to a team meeting happening now (open from 30 min before start until 30 min after the end). Get the meeting ID from team_my_week. Set remote=true when they join remotely.",
		func(ctx context.Context, input teamMeetingInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			rec, err := team.CheckIn(app, actorID, input.MeetingID, input.Remote)
			var result any
			if rec != nil {
				result = map[string]any{"ok": true, "state": rec.GetString("state")}
			}
			return calendarToolResult(app, actorID, "team check in", result, err)
		},
	)
}

func newTeamCantComeTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_cant_come",
		"Tell the team ahead of time that the current user can't come to an upcoming team meeting, with a reason (also posted to Slack). On time it counts as excused; GO! members must say it 72 h before a Community meeting and 24 h before other meetings, otherwise it counts as unexcused. GO! members get a follow-up task for each missed Community meeting. Get the meeting ID from team_my_week. If they can come after all, use team_withdraw_absence. Before calling, if the user has not said it, ask in one short message for: which meeting (if more than one could match; confirm its date) and the reason.",
		func(ctx context.Context, input teamMeetingInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			u, err := actorRecord(app, actorID)
			if err != nil {
				return calendarToolResult(app, actorID, "team cant come", nil, err)
			}
			rec, err := team.NoticeAbsence(app, u, input.MeetingID, normalizeEscapedText(input.Reason))
			var result any
			if rec != nil {
				result = map[string]any{"ok": true, "state": rec.GetString("state"), "late_notice": rec.GetBool("notice_late"),
					"follow_up_task_created": rec.GetString("follow_up_task") != ""}
			}
			return calendarToolResult(app, actorID, "team cant come", result, err)
		},
	)
}

func newTeamWithdrawAbsenceTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_withdraw_absence",
		"Take back the current user's \"can't come\" notice for an upcoming meeting (they can come after all). Only before the meeting starts.",
		func(ctx context.Context, input teamMeetingInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			u, err := actorRecord(app, actorID)
			if err == nil {
				err = team.WithdrawNotice(app, u, input.MeetingID)
			}
			var result any
			if err == nil {
				result = map[string]any{"ok": true}
			}
			return calendarToolResult(app, actorID, "team withdraw absence", result, err)
		},
	)
}

func newTeamRequestPauseTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"team_request_pause",
		"Ask the admins for a pause (e.g. exam period) for the current user. Weeks on pause don't count as behind and don't break the streak. Impact: up to 6 weeks a year, starting tomorrow at the earliest; GO!: short periods, with a reason. Admins approve it on the Requests page (/requests). Before calling, if the user has not said it, ask in one short message for: the first and last day and the reason (required).",
		func(ctx context.Context, input teamPauseInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			u, err := actorRecord(app, actorID)
			if err != nil {
				return calendarToolResult(app, actorID, "team request pause", nil, err)
			}
			start, err1 := time.ParseInLocation("2006-01-02", input.Start, team.Location)
			end, err2 := time.ParseInLocation("2006-01-02", input.End, team.Location)
			if err1 != nil || err2 != nil {
				return fantasy.NewTextErrorResponse("start and end must be YYYY-MM-DD"), nil
			}
			rec, err := team.RequestPause(app, u, start, end, normalizeEscapedText(input.Reason))
			var result any
			if rec != nil {
				result = map[string]any{"ok": true, "status": "pending", "start": input.Start, "end": input.End}
			}
			return calendarToolResult(app, actorID, "team request pause", result, err)
		},
	)
}
