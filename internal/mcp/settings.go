package mcp

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/pixari/opentodo/internal/audit"
)

// SettingKey is the owner setting that switches the endpoint on (design D5).
// The value is the plain string "true" or "false"; a missing row means off.
const SettingKey = "mcp.enabled"

// WritesKey is the owner setting "AI assistants may make changes"
// (mcp-write-tools D3), off by default, stored like SettingKey.
const WritesKey = "mcp.writes"

// Settings reads and writes the owner's MCP switches. Values are cached in
// memory: the mux consults them on every /mcp request, and only Set*/Seed*
// change them, all through this type.
type Settings struct {
	db      *sql.DB
	now     func() time.Time
	enabled boolSetting
	writes  boolSetting
}

// boolSetting is one cached boolean setting. state is 0 while unknown (load on next
// read), 1 for off, 2 for on.
type boolSetting struct {
	key   string
	state atomic.Int32
}

// NewSettings wires the switches over the shared settings table.
func NewSettings(db *sql.DB) *Settings {
	s := &Settings{db: db, now: time.Now}
	s.enabled.key, s.writes.key = SettingKey, WritesKey
	return s
}

// Enabled reports whether the endpoint is on. A database error reads as off.
func (s *Settings) Enabled(ctx context.Context) bool { return s.read(ctx, &s.enabled) }

// WritesEnabled reports whether the owner allows assistant writes. A database
// error reads as off.
func (s *Settings) WritesEnabled(ctx context.Context) bool { return s.read(ctx, &s.writes) }

func (s *Settings) read(ctx context.Context, f *boolSetting) bool {
	switch f.state.Load() {
	case 1:
		return false
	case 2:
		return true
	}
	var v sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, f.key).Scan(&v)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false
	}
	on := v.Valid && v.String == "true"
	f.store(on)
	return on
}

func (f *boolSetting) store(on bool) {
	if on {
		f.state.Store(2)
	} else {
		f.state.Store(1)
	}
}

// Seed applies the optional OPENTODO_MCP preset the first time only: once the
// key exists, the value set in Settings wins. It reports whether it wrote.
func (s *Settings) Seed(ctx context.Context, preset *bool) (bool, error) {
	return s.seed(ctx, &s.enabled, preset)
}

// SeedWrites applies the optional OPENTODO_MCP_WRITES preset the first time only.
func (s *Settings) SeedWrites(ctx context.Context, preset *bool) (bool, error) {
	return s.seed(ctx, &s.writes, preset)
}

func (s *Settings) seed(ctx context.Context, f *boolSetting, preset *bool) (bool, error) {
	if preset == nil {
		return false, nil
	}
	res, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)`,
		f.key, fmt.Sprint(*preset), s.now().UnixMilli())
	if err != nil {
		return false, fmt.Errorf("seed %s setting: %w", f.key, err)
	}
	f.state.Store(0)
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// Set stores the endpoint toggle on behalf of actorID and, when it changes,
// records a settings.changed audit event in the same transaction. rec may be nil.
func (s *Settings) Set(ctx context.Context, actorID string, enabled bool, rec *audit.Recorder) error {
	return s.set(ctx, &s.enabled, actorID, enabled, rec)
}

// SetWrites stores "AI assistants may make changes" like Set.
func (s *Settings) SetWrites(ctx context.Context, actorID string, on bool, rec *audit.Recorder) error {
	return s.set(ctx, &s.writes, actorID, on, rec)
}

func (s *Settings) set(ctx context.Context, f *boolSetting, actorID string, on bool, rec *audit.Recorder) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var old sql.NullString
	if err := tx.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, f.key).Scan(&old); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("read %s setting: %w", f.key, err)
	}
	before := old.Valid && old.String == "true"
	if _, err := tx.ExecContext(ctx, `INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		f.key, fmt.Sprint(on), s.now().UnixMilli()); err != nil {
		return fmt.Errorf("store %s setting: %w", f.key, err)
	}
	if before != on && rec != nil {
		if err := rec.RecordTx(ctx, tx, audit.SettingsChanged(actorID, f.key, fmt.Sprint(before), fmt.Sprint(on))); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	f.store(on)
	return nil
}
