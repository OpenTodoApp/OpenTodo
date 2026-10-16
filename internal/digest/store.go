package digest

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/pixari/opentodo/internal/mail"
)

// Settings are one user's digest settings (design D5).
type Settings struct {
	UserID   string
	Enabled  bool
	Weekday  int // 0 = Sunday
	Hour     int
	TimeZone string
	Lang     string
	// Origin is the server address the settings were saved from (for the
	// review link when no base URL is configured).
	Origin string
	// LastSentFor is the local date the digest was sent or given up for.
	LastSentFor   string
	LastOutcome   string
	LastAttemptAt int64 // Unix ms, 0 = never
}

// Defaults are what a user who never opted in sees: Fridays at 07:00.
func Defaults(userID string) Settings {
	return Settings{UserID: userID, Weekday: 5, Hour: 7, TimeZone: "UTC", Lang: "en"}
}

// InvalidError names the field a Put refused.
type InvalidError struct{ Field, Reason string }

func (e *InvalidError) Error() string { return e.Field + ": " + e.Reason }

// Validate checks the editable fields.
func (s Settings) Validate() error {
	if s.Weekday < 0 || s.Weekday > 6 {
		return &InvalidError{"weekday", "must be 0 (Sunday) to 6 (Saturday)"}
	}
	if s.Hour < 0 || s.Hour > 23 {
		return &InvalidError{"hour", "must be 0 to 23"}
	}
	if s.TimeZone == "" || s.TimeZone == "Local" {
		return &InvalidError{"timeZone", "must be an IANA time zone such as Europe/Zurich"}
	}
	if _, err := time.LoadLocation(s.TimeZone); err != nil {
		return &InvalidError{"timeZone", "unknown time zone " + fmt.Sprintf("%q", s.TimeZone)}
	}
	if !slices.Contains(mail.Languages, s.Lang) {
		return &InvalidError{"language", "must be one of en, de, fr, es, it, pt"}
	}
	return nil
}

// Store keeps the settings in email_digests.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// NewStore wraps the database; now defaults to time.Now.
func NewStore(db *sql.DB, now func() time.Time) *Store {
	if now == nil {
		now = time.Now
	}
	return &Store{db: db, now: now}
}

const columns = `user_id, enabled, weekday, hour, time_zone, lang, origin, last_sent_for, last_outcome, COALESCE(last_attempt_at, 0)`

func scan(row interface{ Scan(...any) error }) (Settings, error) {
	var s Settings
	err := row.Scan(&s.UserID, &s.Enabled, &s.Weekday, &s.Hour, &s.TimeZone, &s.Lang, &s.Origin, &s.LastSentFor, &s.LastOutcome, &s.LastAttemptAt)
	return s, err
}

// Get returns the user's settings, or the defaults when there is no row.
func (st *Store) Get(ctx context.Context, userID string) (Settings, error) {
	s, err := scan(st.db.QueryRowContext(ctx, `SELECT `+columns+` FROM email_digests WHERE user_id = ?`, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return Defaults(userID), nil
	}
	return s, err
}

// Put validates and stores the editable fields, keeping the send state.
func (st *Store) Put(ctx context.Context, s Settings) (Settings, error) {
	if err := s.Validate(); err != nil {
		return Settings{}, err
	}
	now := st.now().UnixMilli()
	_, err := st.db.ExecContext(ctx, `INSERT INTO email_digests (user_id, enabled, weekday, hour, time_zone, lang, origin, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, weekday = excluded.weekday, hour = excluded.hour,
			time_zone = excluded.time_zone, lang = excluded.lang, origin = excluded.origin, updated_at = excluded.updated_at`,
		s.UserID, s.Enabled, s.Weekday, s.Hour, s.TimeZone, s.Lang, s.Origin, now, now)
	if err != nil {
		return Settings{}, fmt.Errorf("store digest settings: %w", err)
	}
	return st.Get(ctx, s.UserID)
}

// Disable turns the user's digest off (encryption turned on); it reports
// whether a digest was on.
func (st *Store) Disable(ctx context.Context, userID string) (bool, error) {
	res, err := st.db.ExecContext(ctx, `UPDATE email_digests SET enabled = 0, updated_at = ? WHERE user_id = ? AND enabled = 1`, st.now().UnixMilli(), userID)
	if err != nil {
		return false, fmt.Errorf("disable digest: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// Enabled lists every enabled row.
func (st *Store) Enabled(ctx context.Context) ([]Settings, error) {
	rows, err := st.db.QueryContext(ctx, `SELECT `+columns+` FROM email_digests WHERE enabled = 1 ORDER BY user_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Settings
	for rows.Next() {
		s, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// MarkAttempt records that a send starts now.
func (st *Store) MarkAttempt(ctx context.Context, userID string, at time.Time) error {
	_, err := st.db.ExecContext(ctx, `UPDATE email_digests SET last_attempt_at = ? WHERE user_id = ?`, at.UnixMilli(), userID)
	return err
}

// MarkOutcome records how the latest attempt ended; a final outcome ("sent",
// "skipped") also records the local date it was for, so it is not sent again.
func (st *Store) MarkOutcome(ctx context.Context, userID, outcome, forDate string) error {
	if forDate == "" {
		_, err := st.db.ExecContext(ctx, `UPDATE email_digests SET last_outcome = ? WHERE user_id = ?`, outcome, userID)
		return err
	}
	_, err := st.db.ExecContext(ctx, `UPDATE email_digests SET last_outcome = ?, last_sent_for = ? WHERE user_id = ?`, outcome, forDate, userID)
	return err
}

// MarkSent records a successful send for a local date.
func (st *Store) MarkSent(ctx context.Context, userID, forDate string) error {
	return st.MarkOutcome(ctx, userID, "sent", forDate)
}
