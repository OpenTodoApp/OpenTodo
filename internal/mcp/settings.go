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

// Settings reads and writes the owner's MCP toggle. The value is cached in
// memory: the mux consults it on every /mcp request, before authentication, and
// only Set and Seed change it, both through this type.
type Settings struct {
	db  *sql.DB
	now func() time.Time
	// state is 0 while unknown (load on next read), 1 for off, 2 for on.
	state atomic.Int32
}

// NewSettings wires the toggle over the shared settings table.
func NewSettings(db *sql.DB) *Settings { return &Settings{db: db, now: time.Now} }

// Enabled reports whether the endpoint is on. A database error reads as off.
func (s *Settings) Enabled(ctx context.Context) bool {
	switch s.state.Load() {
	case 1:
		return false
	case 2:
		return true
	}
	var v sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, SettingKey).Scan(&v)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false
	}
	on := v.Valid && v.String == "true"
	s.store(on)
	return on
}

func (s *Settings) store(on bool) {
	if on {
		s.state.Store(2)
	} else {
		s.state.Store(1)
	}
}

// Seed applies the optional OPENTODO_MCP preset the first time only: once the
// key exists, the value set in Settings wins. It reports whether it wrote.
func (s *Settings) Seed(ctx context.Context, preset *bool) (bool, error) {
	if preset == nil {
		return false, nil
	}
	res, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)`,
		SettingKey, fmt.Sprint(*preset), s.now().UnixMilli())
	if err != nil {
		return false, fmt.Errorf("seed mcp setting: %w", err)
	}
	s.state.Store(0)
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// Set stores the toggle on behalf of actorID and, when it changes, records a
// settings.changed audit event in the same transaction. rec may be nil.
func (s *Settings) Set(ctx context.Context, actorID string, enabled bool, rec *audit.Recorder) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var old sql.NullString
	if err := tx.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, SettingKey).Scan(&old); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("read mcp setting: %w", err)
	}
	before := old.Valid && old.String == "true"
	if _, err := tx.ExecContext(ctx, `INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		SettingKey, fmt.Sprint(enabled), s.now().UnixMilli()); err != nil {
		return fmt.Errorf("store mcp setting: %w", err)
	}
	if before != enabled && rec != nil {
		if err := rec.RecordTx(ctx, tx, audit.SettingsChanged(actorID, SettingKey, fmt.Sprint(before), fmt.Sprint(enabled))); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.store(enabled)
	return nil
}
