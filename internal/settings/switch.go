package settings

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync/atomic"
	"time"
)

// ErrSetByEnvironment refuses a change of a switch the environment fixes.
var ErrSetByEnvironment = errors.New("set by the environment")

// Switch is one owner on/off setting: a JSON bool in the settings table, read
// through an in-memory cache. Every write goes through Set or Seed, so the
// cache is never stale inside one process. A switch may be fixed (an
// environment override, or off on a demo instance): it then reads as the fixed
// value and refuses Set.
type Switch struct {
	db    *sql.DB
	key   string
	o     SwitchOptions
	now   func() time.Time
	state atomic.Int32 // 0 not loaded, 1 off, 2 on
}

// SwitchOptions are a Switch's default and override.
type SwitchOptions struct {
	// Default is the value while the setting was never stored.
	Default bool
	// Fixed, when not nil, is the value whatever is stored; FixedBy names what
	// fixes it (an environment variable).
	Fixed   *bool
	FixedBy string
	// Log receives read errors in On (nil: slog.Default).
	Log *slog.Logger
}

// NewSwitch wires the switch stored under key.
func NewSwitch(db *sql.DB, key string, o SwitchOptions) *Switch {
	if o.Log == nil {
		o.Log = slog.Default()
	}
	return &Switch{db: db, key: key, o: o, now: time.Now}
}

// Key is the setting's key.
func (s *Switch) Key() string { return s.key }

// FixedBy names what fixes the switch, "" when the owner may change it.
func (s *Switch) FixedBy() string {
	if s.o.Fixed == nil {
		return ""
	}
	return s.o.FixedBy
}

// Locked reports whether the switch is fixed.
func (s *Switch) Locked() bool { return s.o.Fixed != nil }

// Read reports the switch through the cache.
func (s *Switch) Read(ctx context.Context) (bool, error) {
	if s.o.Fixed != nil {
		return *s.o.Fixed, nil
	}
	switch s.state.Load() {
	case 1:
		return false, nil
	case 2:
		return true, nil
	}
	on, err := s.load(ctx, s.db)
	if err != nil {
		return false, err
	}
	s.remember(on)
	return on, nil
}

// On is Read's answer, off when the setting cannot be read.
func (s *Switch) On(ctx context.Context) bool {
	on, err := s.Read(ctx)
	if err != nil {
		s.o.Log.Error("read owner switch", "setting", s.key, "err", err)
		return false
	}
	return on
}

// Set stores on and reports the value before. changed, when not nil, runs in
// the same transaction when the value changes (an audit event), so the change
// and its record commit together.
func (s *Switch) Set(ctx context.Context, on bool, changed func(tx *sql.Tx, before bool) error) (bool, error) {
	if s.o.Fixed != nil {
		return *s.o.Fixed, ErrSetByEnvironment
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("write setting %s: %w", s.key, err)
	}
	defer tx.Rollback()
	before, err := s.load(ctx, tx)
	if err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		s.key, boolJSON(on), s.now().UnixMilli()); err != nil {
		return before, fmt.Errorf("write setting %s: %w", s.key, err)
	}
	if changed != nil && before != on {
		if err := changed(tx, before); err != nil {
			return before, err
		}
	}
	if err := tx.Commit(); err != nil {
		return before, fmt.Errorf("write setting %s: %w", s.key, err)
	}
	s.remember(on)
	return before, nil
}

// Seed applies a preset the first time only: once the key exists, the stored
// value wins. It reports whether it wrote; a nil preset does nothing.
func (s *Switch) Seed(ctx context.Context, preset *bool) (bool, error) {
	if preset == nil {
		return false, nil
	}
	res, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)`,
		s.key, boolJSON(*preset), s.now().UnixMilli())
	if err != nil {
		return false, fmt.Errorf("seed %s setting: %w", s.key, err)
	}
	s.state.Store(0)
	n, _ := res.RowsAffected()
	return n > 0, nil
}

type rowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// load reads the stored value, the default when there is none.
func (s *Switch) load(ctx context.Context, q rowQuerier) (bool, error) {
	var raw sql.NullString
	err := q.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, s.key).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !raw.Valid) {
		return s.o.Default, nil
	}
	if err != nil {
		return false, fmt.Errorf("read setting %s: %w", s.key, err)
	}
	var on bool
	if err := json.Unmarshal([]byte(raw.String), &on); err != nil {
		return false, fmt.Errorf("decode setting %s: %w", s.key, err)
	}
	return on, nil
}

func (s *Switch) remember(on bool) {
	if on {
		s.state.Store(2)
	} else {
		s.state.Store(1)
	}
}

func boolJSON(on bool) string {
	if on {
		return "true"
	}
	return "false"
}
