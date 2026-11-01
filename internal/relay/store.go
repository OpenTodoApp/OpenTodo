// Package relay lets a cloud MCP client work on an end-to-end encrypted
// account through one of the user's own devices (OpenSpec change
// mcp-device-relay). The device decrypts and encrypts the values a tool call
// needs; the server never holds the key and never stores, logs or audits
// relayed plaintext. See openspec/changes/mcp-device-relay/security-review.md.
//
// The same stream carries routine runs of an encrypted account to the devices
// opted in to run them (OpenSpec change routines-ai-step, design D7): the
// server sends ids only, the device plans on its decrypted copy and commits
// ciphertext through the rules routes.
//
// This file is the opt-in state (design D3, review R2): which devices of an
// account answer AI connectors and which run routines, each bound to the
// session that opted it in.
package relay

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
)

// Capabilities a device announces when its stream opens (routines-ai-step D7).
const (
	CapRoutines = "routines"
	CapAI       = "ai"
)

// Device is one opted-in device: MCP answers AI connectors (ends on lock),
// Routines runs the account's routines (survives lock).
type Device struct {
	DeviceID  string `json:"deviceId"`
	Label     string `json:"label"`
	EnabledAt int64  `json:"enabledAt"`
	MCP       bool   `json:"mcp"`
	Routines  bool   `json:"routines"`
	// Capabilities are what the device announced on its last stream.
	Capabilities []string `json:"capabilities"`
	// SessionHash binds the opt-in to the session that made it (review R2).
	SessionHash string `json:"-"`
}

// Has reports whether the device announced a capability.
func (d Device) Has(c string) bool { return slices.Contains(d.Capabilities, c) }

// Store reads and writes relay_devices.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// NewStore returns a Store over the server's database.
func NewStore(db *sql.DB) *Store { return &Store{db: db, now: time.Now} }

// MaxLabel bounds a device label.
const MaxLabel = 80

// Enable opts a device in to answer AI connectors (or refreshes its label and
// session); it reports whether the device was newly opted in for that.
func (s *Store) Enable(ctx context.Context, userID, deviceID, label, sessionHash string) (bool, error) {
	return s.enable(ctx, userID, deviceID, label, sessionHash, "mcp")
}

// EnableRoutines opts a device in to run the account's routines; it reports
// whether the device was newly opted in for that.
func (s *Store) EnableRoutines(ctx context.Context, userID, deviceID, label, sessionHash string) (bool, error) {
	return s.enable(ctx, userID, deviceID, label, sessionHash, "routines")
}

func (s *Store) enable(ctx context.Context, userID, deviceID, label, sessionHash, flag string) (bool, error) {
	if deviceID == "" || len(deviceID) > 128 || sessionHash == "" {
		return false, errors.New("relay: device and session are required")
	}
	if r := []rune(label); len(r) > MaxLabel {
		label = string(r[:MaxLabel])
	}
	d, err := s.Get(ctx, userID, deviceID)
	if err != nil {
		return false, err
	}
	mcp, routines := flag == "mcp", flag == "routines"
	fresh := d == nil || (mcp && !d.MCP) || (routines && !d.Routines)
	// The other opt-in stays only when it was made by the same session.
	if d != nil && d.SessionHash == sessionHash {
		mcp, routines = mcp || d.MCP, routines || d.Routines
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO relay_devices (user_id, device_id, label, session_hash, enabled_at, mcp, routines) VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (user_id, device_id) DO UPDATE SET label = excluded.label, session_hash = excluded.session_hash, mcp = excluded.mcp, routines = excluded.routines`,
		userID, deviceID, label, sessionHash, s.now().UnixMilli(), mcp, routines)
	if err != nil {
		return false, fmt.Errorf("relay: opt in: %w", err)
	}
	return fresh, nil
}

const deviceColumns = `device_id, label, session_hash, enabled_at, mcp, routines, capabilities`

func scanDevice(sc interface{ Scan(...any) error }) (Device, error) {
	var d Device
	var caps string
	err := sc.Scan(&d.DeviceID, &d.Label, &d.SessionHash, &d.EnabledAt, &d.MCP, &d.Routines, &caps)
	d.Capabilities = splitCaps(caps)
	return d, err
}

func splitCaps(s string) []string {
	out := []string{}
	for _, c := range strings.Split(s, ",") {
		if c = strings.TrimSpace(c); c != "" && !slices.Contains(out, c) {
			out = append(out, c)
		}
	}
	return out
}

// Get returns one opted-in device, or nil.
func (s *Store) Get(ctx context.Context, userID, deviceID string) (*Device, error) {
	d, err := scanDevice(s.db.QueryRowContext(ctx, `SELECT `+deviceColumns+` FROM relay_devices WHERE user_id = ? AND device_id = ?`, userID, deviceID))
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
	rows, err := s.db.QueryContext(ctx, `SELECT `+deviceColumns+` FROM relay_devices WHERE user_id = ? ORDER BY enabled_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("relay: list devices: %w", err)
	}
	defer rows.Close()
	out := []Device{}
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			return nil, fmt.Errorf("relay: list devices: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// Any reports whether the account has a device opted in to answer AI connectors.
func (s *Store) Any(ctx context.Context, userID string) (bool, error) {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM relay_devices WHERE user_id = ? AND mcp = 1`, userID).Scan(&n); err != nil {
		return false, fmt.Errorf("relay: count devices: %w", err)
	}
	return n > 0, nil
}

// RoutineDevices reports whether the account has a device opted in to run
// routines, and whether one of them announced the on-device assistant.
func (s *Store) RoutineDevices(ctx context.Context, userID string) (opted, ai bool, err error) {
	rows, err := s.db.QueryContext(ctx, `SELECT capabilities FROM relay_devices WHERE user_id = ? AND routines = 1`, userID)
	if err != nil {
		return false, false, fmt.Errorf("relay: routine devices: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var caps string
		if err := rows.Scan(&caps); err != nil {
			return false, false, err
		}
		opted = true
		ai = ai || slices.Contains(splitCaps(caps), CapAI)
	}
	return opted, ai, rows.Err()
}

// SetCapabilities records what a device announced when its stream opened
// (known capabilities only).
func (s *Store) SetCapabilities(ctx context.Context, userID, deviceID string, caps []string) error {
	known := KnownCaps(caps)
	_, err := s.db.ExecContext(ctx, `UPDATE relay_devices SET capabilities = ? WHERE user_id = ? AND device_id = ?`, strings.Join(known, ","), userID, deviceID)
	return err
}

// KnownCaps keeps the capabilities this server knows, sorted, once each.
func KnownCaps(caps []string) []string {
	known := []string{}
	for _, c := range caps {
		if (c == CapRoutines || c == CapAI) && !slices.Contains(known, c) {
			known = append(known, c)
		}
	}
	slices.Sort(known)
	return known
}

// Disable ends a device's AI connector opt-in (a routines opt-in stays) and
// returns it, or nil when it was not opted in.
func (s *Store) Disable(ctx context.Context, userID, deviceID string) (*Device, error) {
	return s.disable(ctx, userID, deviceID, "mcp")
}

// DisableRoutines ends a device's routines opt-in (an AI connector opt-in
// stays) and returns it, or nil when it was not opted in.
func (s *Store) DisableRoutines(ctx context.Context, userID, deviceID string) (*Device, error) {
	return s.disable(ctx, userID, deviceID, "routines")
}

func (s *Store) disable(ctx context.Context, userID, deviceID, flag string) (*Device, error) {
	d, err := s.Get(ctx, userID, deviceID)
	if err != nil || d == nil {
		return nil, err
	}
	if (flag == "mcp" && !d.MCP) || (flag == "routines" && !d.Routines) {
		return nil, nil
	}
	other := d.Routines
	if flag == "routines" {
		other = d.MCP
	}
	q := `DELETE FROM relay_devices WHERE user_id = ? AND device_id = ?`
	if other {
		q = `UPDATE relay_devices SET ` + flag + ` = 0 WHERE user_id = ? AND device_id = ?`
	}
	if _, err := s.db.ExecContext(ctx, q, userID, deviceID); err != nil {
		return nil, fmt.Errorf("relay: opt out: %w", err)
	}
	return d, nil
}

// DisableSession opts out every device that the session opted in (sign-out),
// for AI connectors and routines alike, and returns them.
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
