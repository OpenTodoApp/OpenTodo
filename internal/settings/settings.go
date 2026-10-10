// Package settings stores owner-level server settings and the secrets that go
// with them.
//
// Non-secret settings live in the shared `settings` key/value table as JSON
// values. Only the owner may change them; callers enforce that at the HTTP layer
// (see httpapi.requireOwner) because this package has no notion of users.
//
// Secrets (destination credentials, encryption passphrases) never touch the
// database: they live in small JSON files under <data>/secrets/ with mode 0600,
// so a database snapshot never contains the keys to itself.
package settings

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// Store reads and writes JSON values in the settings table.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// New wires a Store.
func New(db *sql.DB) *Store { return &Store{db: db, now: time.Now} }

// Get loads key into dst. It reports false (and leaves dst untouched) when the
// key does not exist or holds NULL (the value column is nullable on installs
// where the webhooks migration created the table).
func (s *Store) Get(ctx context.Context, key string, dst any) (bool, error) {
	var raw sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !raw.Valid) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read setting %s: %w", key, err)
	}
	if err := json.Unmarshal([]byte(raw.String), dst); err != nil {
		return false, fmt.Errorf("decode setting %s: %w", key, err)
	}
	return true, nil
}

// Set stores v as the JSON value of key.
func (s *Store) Set(ctx context.Context, key string, v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("encode setting %s: %w", key, err)
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, string(raw), s.now().UnixMilli())
	if err != nil {
		return fmt.Errorf("write setting %s: %w", key, err)
	}
	return nil
}

// GetString returns a plain (non-JSON) string value, or "" when absent or NULL.
func (s *Store) GetString(ctx context.Context, key string) (string, error) {
	var v sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return v.String, err
}

// Delete removes key (no error when absent).
func (s *Store) Delete(ctx context.Context, key string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM settings WHERE key = ?`, key)
	return err
}

// GenerationKey holds the op-log generation (see docs/sync.md).
const GenerationKey = "generation"
