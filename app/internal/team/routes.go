package team

import (
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/xusenlin/workavera/internal/org"
)

// registerRoutes is the full HTTP surface of the team package. Handlers live
// next to the logic they call (handleX in the file of the same topic).
// Frontend client: frontend/src/lib/team.ts. Slack routes: internal/slack.
func registerRoutes(se *core.ServeEvent) {
	// Public: Slack fetches the QR image for reminders; the link it encodes
	// still needs a signed-in member.
	se.Router.GET("/api/team/qr/{id}", handleMeetingQR)

	g := se.Router.Group("/api/team")
	g.Bind(apis.RequireAuth(org.ColUsers))
	perm := org.RequirePerm

	// Me and the team
	g.GET("/me", handleMe)
	g.GET("/overview", perm(org.PermTeamView, handleOverview))
	g.GET("/members/{id}", perm(org.PermTeamView, handleMember))
	g.POST("/members", perm(org.PermMembersManage, handleCreateMember))
	g.POST("/members/{id}/jarvis", perm(org.PermMembersManage, handleSetJarvis))
	g.GET("/settings", perm(org.PermTeamView, handleGetSettings))
	g.POST("/settings", perm(org.PermMembersManage, handleSetSettings))

	// Meetings and attendance
	g.GET("/meetings/upcoming", handleUpcoming)
	g.POST("/calendar/sync", perm(org.PermCalendarSync, handleCalendarSync))
	g.POST("/checkin", handleCheckin)
	g.POST("/attendance/bulk", perm(org.PermAttendanceRecord, handleBulkAttendance))
	g.POST("/absence", handleAbsence)
	g.DELETE("/absence/{meeting}", handleWithdrawAbsence)

	// Requests (who may decide is checked inside DecideRequest)
	g.POST("/requests/hours", handleRequestHours)
	g.POST("/requests/handoff", handleRequestHandoff)
	g.POST("/requests/pause", handleRequestPause)
	g.POST("/requests/{id}/decide", handleDecideRequest)
	g.POST("/requests/{id}/withdraw", handleWithdrawRequest)

	// Pauses (admins)
	g.POST("/members/{id}/pauses", perm(org.PermMembersManage, handleSetPause))
	g.DELETE("/pauses/{id}", perm(org.PermMembersManage, handleDeletePause))

	// Finished tasks (admins; checked inside CancelTask/RestoreTask)
	g.POST("/tasks/{id}/cancel", handleCancelTask)
	g.POST("/tasks/{id}/restore", handleRestoreTask)

	// Work timer
	g.GET("/timer", handleGetTimer)
	g.POST("/timer/start", handleStartTimer)
	g.POST("/timer/extend", handleExtendTimer)
	g.POST("/timer/pause", handlePauseTimer(true))
	g.POST("/timer/resume", handlePauseTimer(false))
	g.POST("/timer/stop", handleStopTimer)

	// Tree
	g.GET("/tree", handleGetTree)
	g.POST("/tree/water", handleWaterTree)
	g.POST("/tree/demo/{action}", handleTreeDemo)
	g.GET("/tree/member/{id}", perm(org.PermMembersManage, handleMemberTree))
	g.POST("/tree/member/{id}/vacation", perm(org.PermMembersManage, handleSetVacation))
}

// replyRecord answers with the record, or the error as a 400.
func replyRecord(e *core.RequestEvent, rec *core.Record, err error) error {
	if err != nil {
		return e.BadRequestError(err.Error(), nil)
	}
	return e.JSON(200, rec)
}
