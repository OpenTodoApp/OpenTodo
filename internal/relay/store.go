// Package relay lets a cloud MCP client work on an end-to-end encrypted
// account through one of the user's own devices (OpenSpec change
// mcp-device-relay). The device decrypts and encrypts the values a tool call
// needs; the server never holds the key and never stores, logs or audits
// relayed plaintext. See openspec/changes/mcp-device-relay/security-review.md.
//
// This file is the opt-in state (design D3, review R2): which devices of an
// account answer AI connectors, each bound to the session that opted it in.
package relay

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// Device is one opted-in device.
type Device struct {
	DeviceID  string `json:"deviceId"`
	Label     string `json:"label"`
	EnabledAt int64  `json:"enabledAt"`
	// SessionHash binds the opt-in to the session that made it (review R2).
	SessionHash string `json:"-"`
}

// Store reads and writes relay_devices.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// NewStore returns a Store over the server's database.
func NewStore(db *sql.DB) *Store { return &Store{db: db, now: time.Now} }

// MaxLabel bounds a device label.
const MaxLabel = 80

// Enable opts a device in (or refreshes its label and session); it reports
// whether the device was newly opted in.
func (s *Store) Enable(ctx context.Context, userID, deviceID, label, sessionHash string) (bool, error) {
	if deviceID == "" || len(deviceID) > 128 || sessionHash == "" {
		return false, errors.New("relay: device and session are required")
	}
	if r := []rune(label); len(r) > MaxLabel {
		label = string(r[:MaxLabel])
	}
	var existing int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM relay_devices WHERE user_id = ? AND device_id = ?`, userID, deviceID).Scan(&existing)
	if err != nil {
		return false, fmt.Errorf("relay: read opt-in: %w", err)
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO relay_devices (user_id, device_id, label, session_hash, enabled_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (user_id, device_id) DO UPDATE SET label = excluded.label, session_hash = excluded.session_hash`,
		userID, deviceID, label, sessionHash, s.now().UnixMilli())
	if err != nil {
		return false, fmt.Errorf("relay: opt in: %w", err)
	}
	return existing == 0, nil
}

// Get returns one opted-in device, or nil.
func (s *Store) Get(ctx context.Context, userID, deviceID string) (*Device, error) {
	d := Device{DeviceID: deviceID}
	err := s.db.QueryRowContext(ctx, `SELECT label, session_hash, enabled_at FROM relay_devices WHERE user_id = ? AND device_id = ?`, userID, deviceID).
		Scan(&d.Label, &d.SessionHash, &d.EnabledAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("relay: read device: %w", err)
	}
	return &d, nil
}

// List returns the account's opted-in devices, most recent first.
func (s *Store) List(ctx context.Context, userID string) ([]Device, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT device_id, label, session_hash, enabled_at FROM relay_devices WHERE user_id = ? ORDER BY enabled_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("relay: list devices: %w", err)
	}
	defer rows.Close()
	out := []Device{}
	for rows.Next() {
		var d Device
		if err := rows.Scan(&d.DeviceID, &d.Label, &d.SessionHash, &d.EnabledAt); err != nil {
			return nil, fmt.Errorf("relay: list devices: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// Any reports whether the account has an opted-in device.
func (s *Store) Any(ctx context.Context, userID string) (bool, error) {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM relay_devices WHERE user_id = ?`, userID).Scan(&n); err != nil {
		return false, fmt.Errorf("relay: count devices: %w", err)
	}
	return n > 0, nil
}

// Disable opts one device out and returns it, or nil when it was not opted in.
func (s *Store) Disable(ctx context.Context, userID, deviceID string) (*Device, error) {
	d, err := s.Get(ctx, userID, deviceID)
	if err != nil || d == nil {
		return nil, err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM relay_devices WHERE user_id = ? AND device_id = ?`, userID, deviceID); err != nil {
		return nil, fmt.Errorf("relay: opt out: %w", err)
	}
	return d, nil
}

// DisableSession opts out every device that the session opted in (sign-out)
// and returns them.
func (s *Store) DisableSession(ctx context.Context, userID, sessionHash string) ([]Device, error) {
	all, err := s.List(ctx, userID)
	if err != nil {
		return nil, err
	}
	var out []Device
	for _, d := range all {
		if d.SessionHash == sessionHash {
			out = append(out, d)
		}
	}
	if len(out) == 0 {
		return nil, nil
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM relay_devices WHERE user_id = ? AND session_hash = ?`, userID, sessionHash); err != nil {
		return nil, fmt.Errorf("relay: opt out session: %w", err)
	}
	return out, nil
}

// DisableAll opts out every device of the account (encryption turned off).
func (s *Store) DisableAll(ctx context.Context, userID string) ([]Device, error) {
	all, err := s.List(ctx, userID)
	if err != nil || len(all) == 0 {
		return nil, err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM relay_devices WHERE user_id = ?`, userID); err != nil {
		return nil, fmt.Errorf("relay: opt out all: %w", err)
	}
	return all, nil
}
