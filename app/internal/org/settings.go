package org

import (
	"encoding/json"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Organisation-wide settings, changed by admins in the app (Settings →
// Organisation) and stored in the configs collection. Not per admin.
const (
	SettingMeetingHours = "team.meeting_hours" // attending a meeting logs its duration as hours
)

// SettingBool reads a boolean setting; missing means false.
func SettingBool(app core.App, key string) bool {
	r, err := app.FindFirstRecordByFilter(ColConfigs, "key = {:k}", dbx.Params{"k": key})
	if err != nil {
		return false
	}
	var v bool
	_ = json.Unmarshal([]byte(r.GetString("value")), &v)
	return v
}

// SetSetting stores a setting, creating it with the description on first use.
func SetSetting(app core.App, key string, value any, description string) error {
	r, err := app.FindFirstRecordByFilter(ColConfigs, "key = {:k}", dbx.Params{"k": key})
	if err != nil {
		col, cerr := app.FindCollectionByNameOrId(ColConfigs)
		if cerr != nil {
			return cerr
		}
		r = core.NewRecord(col)
		r.Set("key", key)
		r.Set("description", description)
	}
	r.Set("value", value)
	return app.Save(r)
}
