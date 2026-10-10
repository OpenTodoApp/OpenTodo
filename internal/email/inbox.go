// Package email turns forwarded mail into tasks (OpenSpec change
// `email-to-task`). The operator configures one mailbox that the server polls
// over IMAP; each user owns a secret sub-address (todo+<secret>@example.com)
// that routes a message to their account. Every task is written through the
// op log (sync.ApplyStrict, device "server"), so devices receive it on sync.
//
// The package keeps no copy of a message: only the task it creates and the
// Message-ID (for deduplication and the hourly cap) are stored.
package email

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
)

// Limits on per-user settings and abuse protection (design D5, D7).
const (
	// SecretBytes is the entropy of an inbox secret: 128 bits.
	SecretBytes = 16
	// MaxAllowlist bounds the sender allowlist.
	MaxAllowlist = 50
	// HourlyCap is the most tasks one account gets from email per rolling hour.
	HourlyCap = 60
	// ReceiptRetention is how long Message-IDs are remembered.
	ReceiptRetention = 90 * 24 * time.Hour
)

// secretEncoding is lowercase base32 without padding: case-insensitive (some
// providers lowercase local parts) and safe in an address local part.
var secretEncoding = base32.NewEncoding("abcdefghijklmnopqrstuvwxyz234567").WithPadding(base32.NoPadding)

// secretLen is the length of an encoded secret (26 characters).
var secretLen = secretEncoding.EncodedLen(SecretBytes)

// ErrInvalidAllowlist reports an allowlist that is not a list of addresses.
var ErrInvalidAllowlist = errors.New("allowlist must be a list of at most 50 email addresses")

// Inbox is one account's email capture settings.
type Inbox struct {
	UserID    string
	Secret    string
	Enabled   bool
	Allowlist []string
	CreatedAt int64
	RotatedAt *int64
}

// Store reads and writes email_inboxes and email_receipts.
type Store struct {
	db    *sql.DB
	audit *audit.Recorder
	now   func() time.Time
}

// NewStore wires a Store. rec may be nil (no audit events).
func NewStore(db *sql.DB, rec *audit.Recorder) *Store {
	return &Store{db: db, audit: rec, now: time.Now}
}

func newSecret() string {
	b := make([]byte, SecretBytes)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("email: crypto/rand failed: %v", err))
	}
	return secretEncoding.EncodeToString(b)
}

// ValidSecret reports whether s has the shape of an inbox secret.
func ValidSecret(s string) bool {
	if len(s) != secretLen {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= 'a' && c <= 'z' || c >= '2' && c <= '7') {
			return false
		}
	}
	return true
}

const inboxCols = `user_id, secret, enabled, allowlist_json, created_at, rotated_at`

type rowScanner interface{ Scan(...any) error }

func scanInbox(r rowScanner) (Inbox, error) {
	var in Inbox
	var enabled int
	var allow string
	var rotated sql.NullInt64
	if err := r.Scan(&in.UserID, &in.Secret, &enabled, &allow, &in.CreatedAt, &rotated); err != nil {
		return in, err
	}
	in.Enabled = enabled != 0
	if rotated.Valid {
		in.RotatedAt = &rotated.Int64
	}
	if err := json.Unmarshal([]byte(allow), &in.Allowlist); err != nil || in.Allowlist == nil {
		in.Allowlist = []string{}
	}
	return in, nil
}

// Get returns the account's inbox, creating it (enabled, with a fresh secret)
// on first use. Creation is recorded as email_inbox.created.
func (s *Store) Get(ctx context.Context, userID string) (Inbox, error) {
	in, err := scanInbox(s.db.QueryRowContext(ctx, `SELECT `+inboxCols+` FROM email_inboxes WHERE user_id = ?`, userID))
	if err == nil {
		return in, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return in, fmt.Errorf("email: load inbox: %w", err)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return in, err
	}
	defer tx.Rollback()
	r, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO email_inboxes(user_id, secret, enabled, allowlist_json, created_at) VALUES(?,?,1,'[]',?)`,
		userID, newSecret(), s.now().UnixMilli())
	if err != nil {
		return in, fmt.Errorf("email: create inbox: %w", err)
	}
	if n, _ := r.RowsAffected(); n == 1 {
		if err := s.audit.RecordTx(ctx, tx, audit.EmailInboxCreated(userID)); err != nil {
			return in, err
		}
	}
	if err := tx.Commit(); err != nil {
		return in, err
	}
	return scanInbox(s.db.QueryRowContext(ctx, `SELECT `+inboxCols+` FROM email_inboxes WHERE user_id = ?`, userID))
}

// Rotate replaces the account's secret; the old address stops routing at once.
func (s *Store) Rotate(ctx context.Context, userID string) (Inbox, error) {
	if _, err := s.Get(ctx, userID); err != nil {
		return Inbox{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Inbox{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE email_inboxes SET secret = ?, rotated_at = ? WHERE user_id = ?`,
		newSecret(), s.now().UnixMilli(), userID); err != nil {
		return Inbox{}, fmt.Errorf("email: rotate: %w", err)
	}
	if err := s.audit.RecordTx(ctx, tx, audit.EmailInboxRotated(userID)); err != nil {
		return Inbox{}, err
	}
	if err := tx.Commit(); err != nil {
		return Inbox{}, err
	}
	return s.Get(ctx, userID)
}

// Update changes the enabled switch and/or the allowlist (nil leaves a value
// as it is). The allowlist must already be normalized by NormalizeAllowlist.
func (s *Store) Update(ctx context.Context, userID string, enabled *bool, allowlist []string) (Inbox, error) {
	cur, err := s.Get(ctx, userID)
	if err != nil {
		return cur, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return cur, err
	}
	defer tx.Rollback()
	if enabled != nil && *enabled != cur.Enabled {
		v := 0
		if *enabled {
			v = 1
		}
		if _, err := tx.ExecContext(ctx, `UPDATE email_inboxes SET enabled = ? WHERE user_id = ?`, v, userID); err != nil {
			return cur, fmt.Errorf("email: update: %w", err)
		}
		if err := s.audit.RecordTx(ctx, tx, audit.EmailInboxUpdated(userID, "enabled",
			strconv.FormatBool(cur.Enabled), strconv.FormatBool(*enabled))); err != nil {
			return cur, err
		}
	}
	if allowlist != nil && !sameList(allowlist, cur.Allowlist) {
		raw, _ := json.Marshal(allowlist)
		if _, err := tx.ExecContext(ctx, `UPDATE email_inboxes SET allowlist_json = ? WHERE user_id = ?`, string(raw), userID); err != nil {
			return cur, fmt.Errorf("email: update: %w", err)
		}
		if err := s.audit.RecordTx(ctx, tx, audit.EmailInboxUpdated(userID, "allowlist",
			strconv.Itoa(len(cur.Allowlist)), strconv.Itoa(len(allowlist)))); err != nil {
			return cur, err
		}
	}
	if err := tx.Commit(); err != nil {
		return cur, err
	}
	return s.Get(ctx, userID)
}

func sameList(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// NormalizeAllowlist validates a sender allowlist: bare addresses only,
// lowercased, duplicates removed, order kept.
func NormalizeAllowlist(list []string) ([]string, error) {
	if len(list) > MaxAllowlist {
		return nil, ErrInvalidAllowlist
	}
	out := make([]string, 0, len(list))
	seen := map[string]bool{}
	for _, raw := range list {
		v := strings.TrimSpace(raw)
		a, err := mail.ParseAddress(v)
		if err != nil || a.Name != "" || !strings.EqualFold(a.Address, v) || len(v) > 254 {
			return nil, ErrInvalidAllowlist
		}
		v = strings.ToLower(a.Address)
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out, nil
}

// BySecret finds the inbox owning secret (case-insensitive).
func (s *Store) BySecret(ctx context.Context, secret string) (Inbox, bool, error) {
	secret = strings.ToLower(secret)
	if !ValidSecret(secret) {
		return Inbox{}, false, nil
	}
	in, err := scanInbox(s.db.QueryRowContext(ctx, `SELECT `+inboxCols+` FROM email_inboxes WHERE secret = ?`, secret))
	if errors.Is(err, sql.ErrNoRows) {
		return Inbox{}, false, nil
	}
	if err != nil {
		return Inbox{}, false, fmt.Errorf("email: find inbox: %w", err)
	}
	return in, true, nil
}

// Deactivated reports whether the account is deactivated (user-management).
func (s *Store) Deactivated(ctx context.Context, userID string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_status WHERE user_id = ? AND deactivated_at IS NOT NULL`, userID).Scan(&n)
	if err != nil {
		return false, fmt.Errorf("email: account status: %w", err)
	}
	return n > 0, nil
}

// HourlyCount counts tasks created from email for the account in the hour
// before now.
func (s *Store) HourlyCount(ctx context.Context, userID string, now time.Time) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM email_receipts WHERE user_id = ? AND received_at > ?`,
		userID, now.Add(-time.Hour).UnixMilli()).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("email: hourly count: %w", err)
	}
	return n, nil
}

// HasReceipt reports whether the Message-ID was already processed for the account.
func (s *Store) HasReceipt(ctx context.Context, userID, messageID string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM email_receipts WHERE user_id = ? AND message_id = ?`, userID, messageID).Scan(&n)
	if err != nil {
		return false, fmt.Errorf("email: receipt: %w", err)
	}
	return n > 0, nil
}

// AddReceipt records a processed Message-ID; false when it was already there.
func (s *Store) AddReceipt(ctx context.Context, userID, messageID string, at time.Time) (bool, error) {
	r, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO email_receipts(user_id, message_id, received_at) VALUES(?,?,?)`,
		userID, messageID, at.UnixMilli())
	if err != nil {
		return false, fmt.Errorf("email: add receipt: %w", err)
	}
	n, _ := r.RowsAffected()
	return n == 1, nil
}

// PruneReceipts removes receipts older than ReceiptRetention.
func (s *Store) PruneReceipts(ctx context.Context, now time.Time) (int64, error) {
	r, err := s.db.ExecContext(ctx, `DELETE FROM email_receipts WHERE received_at < ?`, now.Add(-ReceiptRetention).UnixMilli())
	if err != nil {
		return 0, fmt.Errorf("email: prune receipts: %w", err)
	}
	return r.RowsAffected()
}
