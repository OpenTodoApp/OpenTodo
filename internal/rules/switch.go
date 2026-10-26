package rules

import (
	"database/sql"

	"github.com/pixari/opentodo/internal/settings"
)

// SettingKey is the owner setting that turns automations on or off for the
// server (design D9). Default on.
const SettingKey = "automations.enabled"

// NewSwitch is the server's automations switch: the owner setting, fixed by
// OPENTODO_AUTOMATIONS when env is not nil.
func NewSwitch(db *sql.DB, env *bool) *settings.Switch {
	return settings.NewSwitch(db, SettingKey, settings.SwitchOptions{Default: true, Fixed: env, FixedBy: "OPENTODO_AUTOMATIONS"})
}
