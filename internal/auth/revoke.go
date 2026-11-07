package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// Revoked devices (OpenSpec change revoked-device-wipe). A browser session has
// a wipe key that the device learns from auth/status while signed in. When the
// session is ended on purpose (Sign out everywhere, deactivation, deletion),
// its hash and key are kept in revoked_sessions, and auth/status answers that
// session's cookie with a proof only the holder of the key can check: the
// device removes its local copy when the proof matches, and a forged answer
// changes nothing (design D3).

// RevokedRetention is how long a revoked session is remembered: longer than
// the default session lifetime, so a device that comes back months later still
// removes its copy (design D2).
const RevokedRetention = 365 * 24 * time.Hour

// revokedMessage is what the proof authenticates; web/src/lib/revocation.ts
// uses the same text.
const revokedMessage = "opentodo device revoked v1"

// WipeKey returns the session's wipe key, creating it on first use, so every
// sign-in path and every session from before the upgrade gets one on its next
// auth/status.
func (s *Service) WipeKey(ctx context.Context, tokenHash string) (string, error) {
	var key string
	err := s.db.QueryRowContext(ctx, `SELECT wipe_key FROM session_wipe_keys WHERE token_hash = ?`, tokenHash).Scan(&key)
	if err == nil {
		return key, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("wipe key: %w", err)
	}
	// The session may end meanwhile: the reference refuses the insert, and the
	// caller learns it on its next request.
	if _, err := s.db.ExecContext(ctx, `INSERT INTO session_wipe_keys(token_hash, wipe_key)
		SELECT token_hash, ? FROM sessions WHERE token_hash = ? ON CONFLICT(token_hash) DO NOTHING`, ids.Secret(32), tokenHash); err != nil {
		return "", fmt.Errorf("wipe key: %w", err)
	}
	err = s.db.QueryRowContext(ctx, `SELECT wipe_key FROM session_wipe_keys WHERE token_hash = ?`, tokenHash).Scan(&key)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return key, err
}

// RevokedProof is the proof for a cookie whose session was revoked on purpose,
// or ErrNotFound for any other cookie (expired, signed out, unknown).
func (s *Service) RevokedProof(ctx context.Context, secret string) (string, error) {
	var key string
	err := s.db.QueryRowContext(ctx, `SELECT wipe_key FROM revoked_sessions WHERE token_hash = ? AND keep_until > ?`,
		hashToken(secret), s.clock().UnixMilli()).Scan(&key)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("revoked session: %w", err)
	}
	return WipeProof(key), nil
}

// WipeProof is base64url(HMAC-SHA256(key, revokedMessage)), keyed with the
// key's text as the device stores it.
func WipeProof(key string) string {
	m := hmac.New(sha256.New, []byte(key))
	m.Write([]byte(revokedMessage))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// revokeSessionsTx records every session of userID as revoked, then deletes
// them, in tx. Sessions without a wipe key never loaded the app since the upgrade
// and are not recorded: they behave as expired ones. It returns how many
// sessions it ended.
func (s *Service) revokeSessionsTx(ctx context.Context, tx *sql.Tx, userID string) (int64, error) {
	now := s.clock()
	if _, err := tx.ExecContext(ctx, `INSERT INTO revoked_sessions(token_hash, wipe_key, revoked_at, keep_until)
		SELECT k.token_hash, k.wipe_key, ?, ? FROM session_wipe_keys k JOIN sessions s ON s.token_hash = k.token_hash
		WHERE s.user_id = ? ON CONFLICT(token_hash) DO NOTHING`,
		now.UnixMilli(), now.Add(RevokedRetention).UnixMilli(), userID); err != nil {
		return 0, fmt.Errorf("record revoked sessions: %w", err)
	}
	res, err := tx.ExecContext(ctx, "DELETE FROM sessions WHERE user_id = ?", userID)
	if err != nil {
		return 0, fmt.Errorf("revoke sessions: %w", err)
	}
	return res.RowsAffected()
}

// PruneRevokedSessions forgets revoked sessions past their retention.
func (s *Service) PruneRevokedSessions(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM revoked_sessions WHERE keep_until <= ?`, s.clock().UnixMilli())
	if err != nil {
		return 0, fmt.Errorf("prune revoked sessions: %w", err)
	}
	return res.RowsAffected()
}

// NextRevokedExpiry is when the oldest revoked session leaves (housekeeping's
// deadline); ok is false when none is kept.
func (s *Service) NextRevokedExpiry(ctx context.Context) (time.Time, bool, error) {
	var at sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `SELECT MIN(keep_until) FROM revoked_sessions`).Scan(&at); err != nil {
		return time.Time{}, false, fmt.Errorf("next revoked expiry: %w", err)
	}
	if !at.Valid {
		return time.Time{}, false, nil
	}
	return time.UnixMilli(at.Int64), true, nil
}
