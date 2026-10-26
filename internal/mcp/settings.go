package mcp

import (
	"context"
	"database/sql"
	"strconv"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/settings"
)

// SettingKey is the owner setting that switches the endpoint on (design D5).
// The value is the JSON bool true or false; a missing row means off.
const SettingKey = "mcp.enabled"

// WritesKey is the owner setting "AI assistants may make changes"
// (mcp-write-tools D3), off by default, stored like SettingKey.
const WritesKey = "mcp.writes"

// Settings holds the owner's two MCP switches. The mux consults them on every
// /mcp request, so they are read through the switches' caches.
type Settings struct {
	enabled, writes *settings.Switch
}

// NewSettings wires the switches over the shared settings table.
func NewSettings(db *sql.DB) *Settings {
	return &Settings{enabled: settings.NewSwitch(db, SettingKey, settings.SwitchOptions{}),
		writes: settings.NewSwitch(db, WritesKey, settings.SwitchOptions{})}
}

// Enabled reports whether the endpoint is on. A database error reads as off.
func (s *Settings) Enabled(ctx context.Context) bool { return s.enabled.On(ctx) }

// WritesEnabled reports whether the owner allows assistant writes. A database
// error reads as off.
func (s *Settings) WritesEnabled(ctx context.Context) bool { return s.writes.On(ctx) }

// Seed applies the optional OPENTODO_MCP preset the first time only: once the
// key exists, the value set in Settings wins. It reports whether it wrote.
func (s *Settings) Seed(ctx context.Context, preset *bool) (bool, error) {
	return s.enabled.Seed(ctx, preset)
}

// SeedWrites applies the optional OPENTODO_MCP_WRITES preset the first time only.
func (s *Settings) SeedWrites(ctx context.Context, preset *bool) (bool, error) {
	return s.writes.Seed(ctx, preset)
}

// Set stores the endpoint toggle on behalf of actorID and, when it changes,
// records a settings.changed audit event in the same transaction. rec may be nil.
func (s *Settings) Set(ctx context.Context, actorID string, enabled bool, rec *audit.Recorder) error {
	return set(ctx, s.enabled, actorID, enabled, rec)
}

// SetWrites stores "AI assistants may make changes" like Set.
func (s *Settings) SetWrites(ctx context.Context, actorID string, on bool, rec *audit.Recorder) error {
	return set(ctx, s.writes, actorID, on, rec)
}

func set(ctx context.Context, sw *settings.Switch, actorID string, on bool, rec *audit.Recorder) error {
	_, err := sw.Set(ctx, on, func(tx *sql.Tx, before bool) error {
		return rec.RecordTx(ctx, tx, audit.SettingsChanged(actorID, sw.Key(), strconv.FormatBool(before), strconv.FormatBool(on)))
	})
	return err
}
