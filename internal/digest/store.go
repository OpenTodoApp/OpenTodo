// Package digest is the opt-in weekly email digest (OpenSpec change
// `stats-and-review`, design D5–D7): settings per user, the statistics of the
// last full week (the Go port of web/src/lib/stats.ts, pinned by a shared
// fixture), the message content, and a scheduler on the jobs leader.
package digest

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/pixari/opentodo/internal/mail"
	"github.com/pixari/opentodo/internal/zoned"
)

// Settings is one user's digest configuration and its last outcome.
type Settings struct {
	Enabled       bool   `json:"enabled"`
	Weekday       int    `json:"weekday"` // 0 = Sunday
	Hour          int    `json:"hour"`
	TimeZone      string `json:"timeZone"`
	Language      string `json:"language"`
	LastSentFor   string `json:"lastSentFor,omitempty"`
	LastOutcome   string `json:"lastOutcome,omitempty"`
	LastAttemptAt *int64 `json:"lastAttemptAt,omitempty"`
}

// Defaults for a user who never saved the digest: off, Fridays at 07:00.
var Defaults = Settings{Weekday: 5, Hour: 7, TimeZone: "UTC", Language: "en"}

// InvalidError names the field the user must fix.
type InvalidError struct{ Field, Msg string }

func (e *InvalidError) Error() string { return e.Field + ": " + e.Msg }

// Validate checks weekday, hour, zone and language.
func (s Settings) Validate() error {
	if s.Weekday < 0 || s.Weekday > 6 {
		return &InvalidError{"weekday", "must be from 0 (Sunday) to 6"}
	}
	if s.Hour < 0 || s.Hour > 23 {
		return &InvalidError{"hour", "must be from 0 to 23"}
	}
	if s.TimeZone == "" {
		return &InvalidError{"timeZone", "is required"}
	}
	if _, err := zoned.Load(s.TimeZone); err != nil {
		return &InvalidError{"timeZone", "is not a known time zone"}
	}
	if !slices.Contains(mail.Languages, s.Language) {
		return &InvalidError{"language", "must be one of en, de, fr, es, it, pt"}
	}
	return nil
}

// Store keeps the settings in email_digests.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// NewStore returns a store on db.
func NewStore(db *sql.DB) *Store { return &Store{db: db, now: time.Now} }

const columns = `enabled, weekday, hour, time_zone, lang, COALESCE(last_sent_for,''), COALESCE(last_outcome,''), last_attempt_at`

func scan(row interface{ Scan(...any) error }) (Settings, error) {
	var s Settings
	var enabled int
	var at sql.NullInt64
	if err := row.Scan(&enabled, &s.Weekday, &s.Hour, &s.TimeZone, &s.Language, &s.LastSentFor, &s.LastOutcome, &at); err != nil {
		return s, err
	}
	s.Enabled = enabled == 1
	if at.Valid {
		s.LastAttemptAt = &at.Int64
	}
	return s, nil
}

// Get returns the user's settings, or the defaults when none were saved.
func (st *Store) Get(ctx context.Context, userID string) (Settings, error) {
	s, err := scan(st.db.QueryRowContext(ctx, `SELECT `+columns+` FROM email_digests WHERE user_id = ?`, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return Defaults, nil
	}
	return s, err
}

// Put validates and stores the user's settings (the outcome fields are kept).
func (st *Store) Put(ctx context.Context, userID string, s Settings) error {
	if err := s.Validate(); err != nil {
		return err
	}
	now := st.now().UnixMilli()
	_, err := st.db.ExecContext(ctx, `INSERT INTO email_digests(user_id, enabled, weekday, hour, time_zone, lang, created_at, updated_at)
		VALUES(?,?,?,?,?,?,?,?)
		ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, weekday = excluded.weekday, hour = excluded.hour,
		time_zone = excluded.time_zone, lang = excluded.lang, updated_at = excluded.updated_at`,
		userID, boolInt(s.Enabled), s.Weekday, s.Hour, s.TimeZone, s.Language, now, now)
	if err != nil {
		return fmt.Errorf("save digest settings: %w", err)
	}
	return nil
}

// Disable turns the user's digest off (encryption was turned on) and reports
// whether it was on.
func (st *Store) Disable(ctx context.Context, userID string) (bool, error) {
	res, err := st.db.ExecContext(ctx, `UPDATE email_digests SET enabled = 0, updated_at = ? WHERE user_id = ? AND enabled = 1`, st.now().UnixMilli(), userID)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// MarkAttempt records the start of a send.
func (st *Store) MarkAttempt(ctx context.Context, userID string) error {
	_, err := st.db.ExecContext(ctx, `UPDATE email_digests SET last_attempt_at = ? WHERE user_id = ?`, st.now().UnixMilli(), userID)
	return err
}

// MarkOutcome records how a send for the local date `day` ended; outcome
// "sent" also marks the day as done.
func (st *Store) MarkOutcome(ctx context.Context, userID, day, outcome string) error {
	if outcome == "sent" || outcome == "skipped" {
		_, err := st.db.ExecContext(ctx, `UPDATE email_digests SET last_sent_for = ?, last_outcome = ? WHERE user_id = ?`, day, outcome, userID)
		return err
	}
	_, err := st.db.ExecContext(ctx, `UPDATE email_digests SET last_outcome = ? WHERE user_id = ?`, outcome, userID)
	return err
}

// Row is one enabled user with their settings and address.
type Row struct {
	UserID string
	Email  string
	Settings
}

// Enabled lists every enabled digest of an active account.
func (st *Store) Enabled(ctx context.Context) ([]Row, error) {
	rows, err := st.db.QueryContext(ctx, `SELECT d.user_id, u.email, `+prefixed()+` FROM email_digests d JOIN users u ON u.id = d.user_id
		LEFT JOIN user_status s ON s.user_id = d.user_id WHERE d.enabled = 1 AND s.deactivated_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var r Row
		var enabled int
		var at sql.NullInt64
		if err := rows.Scan(&r.UserID, &r.Email, &enabled, &r.Weekday, &r.Hour, &r.TimeZone, &r.Language, &r.LastSentFor, &r.LastOutcome, &at); err != nil {
			return nil, err
		}
		r.Enabled = enabled == 1
		if at.Valid {
			r.LastAttemptAt = &at.Int64
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func prefixed() string {
	return `d.enabled, d.weekday, d.hour, d.time_zone, d.lang, COALESCE(d.last_sent_for,''), COALESCE(d.last_outcome,''), d.last_attempt_at`
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// NextSend is the next time the digest goes out after `after`, or nil when off.
func NextSend(s Settings, after time.Time) *time.Time {
	if !s.Enabled {
		return nil
	}
	loc, err := zoned.Load(s.TimeZone)
	if err != nil {
		return nil
	}
	local := after.In(loc)
	for i := 0; i <= 7; i++ {
		d := local.AddDate(0, 0, i)
		at := time.Date(d.Year(), d.Month(), d.Day(), s.Hour, 0, 0, 0, loc)
		if int(at.Weekday()) == s.Weekday && at.After(after) && at.Format("2006-01-02") != s.LastSentFor {
			return &at
		}
	}
	return nil
}
