package team

import (
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

// GET /api/team/settings
func handleGetSettings(e *core.RequestEvent) error {
	return e.JSON(200, map[string]any{"meeting_hours": org.SettingBool(e.App, org.SettingMeetingHours)})
}

// POST /api/team/settings {"meeting_hours": true}
func handleSetSettings(e *core.RequestEvent) error {
	var in struct {
		MeetingHours *bool `json:"meeting_hours"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	if in.MeetingHours != nil {
		if err := org.SetSetting(e.App, org.SettingMeetingHours, *in.MeetingHours,
			"Attending a meeting (present or remote) logs its duration as hours."); err != nil {
			return e.BadRequestError(err.Error(), err)
		}
	}
	return handleGetSettings(e)
}
