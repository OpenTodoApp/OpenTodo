package channels

import (
	"database/sql"
	"log/slog"

	"github.com/pixari/opentodo/internal/settings"
)

// SettingKey is the owner switch in the settings table (design D9): on unless
// the owner turned it off.
const SettingKey = "notifications.channels"

func newSwitch(db *sql.DB, log *slog.Logger) *settings.Switch {
	return settings.NewSwitch(db, SettingKey, settings.SwitchOptions{Default: true, Log: log})
}

// Switch is the owner switch; a change that turns it on should Wake the worker.
func (s *Service) Switch() *settings.Switch { return s.sw }
