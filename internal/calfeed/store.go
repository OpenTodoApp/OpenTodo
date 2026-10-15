package calfeed

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/ids"
)

// Subscription limits and refresh pacing (design D3, D4).
const (
	MaxSubscriptions = 10
	DefaultInterval  = time.Hour
	MinInterval      = 30 * time.Minute
	MaxInterval      = 24 * time.Hour
	// BackoffStart and BackoffMax pace a failing subscription: 30 min, doubling to 6 h.
	BackoffStart = 30 * time.Minute
	BackoffMax   = 6 * time.Hour
	// FeedPrefix marks a task feed secret, so no other credential check ever sees one.
	FeedPrefix = "otfeed_"
)

var (
	// ErrNotFound: no subscription with this id belongs to the user.
	ErrNotFound = errors.New("calendar subscription not found")
	// ErrLimit: the user already has MaxSubscriptions subscriptions.
	ErrLimit = errors.New("limit_reached")
)

// Subscription is one calendar a user subscribes to, with its status.
type Subscription struct {
	ID              string   `json:"id"`
	UserID          string   `json:"-"`
	URL             string   `json:"url"`
	Name            string   `json:"name"`
	Color           string   `json:"color"`
	Enabled         bool     `json:"enabled"`
	ETag            string   `json:"-"`
	LastModified    string   `json:"-"`
	RefreshSeconds  *int64   `json:"refreshSeconds"`
	IntervalSeconds int64    `json:"intervalSeconds"`
	NextFetchAt     int64    `json:"nextFetchAt"`
	LastFetchAt     *int64   `json:"lastFetchAt"`
	LastSuccessAt   *int64   `json:"lastSuccessAt"`
	LastError       string   `json:"lastError"`
	StoppedReason   string   `json:"stoppedReason"`
	Warnings        []string `json:"warnings"`
	EventCount      int      `json:"eventCount"`
	CreatedAt       int64    `json:"createdAt"`
	UpdatedAt       int64    `json:"updatedAt"`
}

// Store keeps subscriptions, occurrences and feed tokens in SQLite.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// NewStore wires a store on the server database.
func NewStore(db *sql.DB) *Store { return &Store{db: db, now: time.Now} }

const subColumns = `id, user_id, url, name, color, enabled, etag, last_modified, refresh_seconds, interval_seconds, next_fetch_at,
	last_fetch_at, last_success_at, last_error, COALESCE(stopped_reason,''), warnings, event_count, created_at, updated_at`

func scanSub(row interface{ Scan(...any) error }) (*Subscription, error) {
	var s Subscription
	var enabled int
	var warns string
	var refresh, lastFetch, lastSuccess sql.NullInt64
	if err := row.Scan(&s.ID, &s.UserID, &s.URL, &s.Name, &s.Color, &enabled, &s.ETag, &s.LastModified, &refresh, &s.IntervalSeconds, &s.NextFetchAt,
		&lastFetch, &lastSuccess, &s.LastError, &s.StoppedReason, &warns, &s.EventCount, &s.CreatedAt, &s.UpdatedAt); err != nil {
		return nil, err
	}
	s.Enabled = enabled == 1
	if refresh.Valid {
		s.RefreshSeconds = &refresh.Int64
	}
	if lastFetch.Valid {
		s.LastFetchAt = &lastFetch.Int64
	}
	if lastSuccess.Valid {
		s.LastSuccessAt = &lastSuccess.Int64
	}
	_ = json.Unmarshal([]byte(warns), &s.Warnings)
	if s.Warnings == nil {
		s.Warnings = []string{}
	}
	return &s, nil
}

// List returns the user's subscriptions in creation order.
func (s *Store) List(ctx context.Context, userID string) ([]Subscription, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+subColumns+` FROM calendar_subscriptions WHERE user_id = ? ORDER BY created_at, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Subscription{}
	for rows.Next() {
		sub, err := scanSub(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sub)
	}
	return out, rows.Err()
}

// Get returns one of the user's subscriptions (ErrNotFound for anyone else's).
func (s *Store) Get(ctx context.Context, userID, id string) (*Subscription, error) {
	sub, err := scanSub(s.db.QueryRowContext(ctx, `SELECT `+subColumns+` FROM calendar_subscriptions WHERE id = ? AND user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return sub, err
}

// byID loads a subscription for the worker.
func (s *Store) byID(ctx context.Context, id string) (*Subscription, error) {
	sub, err := scanSub(s.db.QueryRowContext(ctx, `SELECT `+subColumns+` FROM calendar_subscriptions WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return sub, err
}

// Create adds a subscription, due at once; ErrLimit beyond MaxSubscriptions.
func (s *Store) Create(ctx context.Context, userID, url, name, color string) (*Subscription, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM calendar_subscriptions WHERE user_id = ?`, userID).Scan(&n); err != nil {
		return nil, err
	}
	if n >= MaxSubscriptions {
		return nil, ErrLimit
	}
	id := ids.New()
	now := s.now().UnixMilli()
	if _, err := tx.ExecContext(ctx, `INSERT INTO calendar_subscriptions(id,user_id,url,name,color,enabled,interval_seconds,next_fetch_at,created_at,updated_at)
		VALUES(?,?,?,?,?,1,?,?,?,?)`, id, userID, url, name, color, int64(DefaultInterval/time.Second), now, now, now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.Get(ctx, userID, id)
}

// Patch is a partial update of a subscription.
type Patch struct {
	URL     *string
	Name    *string
	Color   *string
	Enabled *bool
}

// Update applies a patch. A new URL clears the cache validators and makes the
// subscription due; enabling clears a stop.
func (s *Store) Update(ctx context.Context, userID, id string, p Patch) (*Subscription, error) {
	if _, err := s.Get(ctx, userID, id); err != nil {
		return nil, err
	}
	now := s.now().UnixMilli()
	set := []string{"updated_at = ?"}
	args := []any{now}
	if p.URL != nil {
		set = append(set, "url = ?", "etag = ''", "last_modified = ''", "next_fetch_at = ?", "stopped_reason = NULL")
		args = append(args, *p.URL, now)
	}
	if p.Name != nil {
		set = append(set, "name = ?")
		args = append(args, *p.Name)
	}
	if p.Color != nil {
		set = append(set, "color = ?")
		args = append(args, *p.Color)
	}
	if p.Enabled != nil {
		set = append(set, "enabled = ?")
		args = append(args, boolInt(*p.Enabled))
		if *p.Enabled {
			set = append(set, "stopped_reason = NULL", "next_fetch_at = ?", "interval_seconds = ?")
			args = append(args, now, int64(DefaultInterval/time.Second))
		}
	}
	args = append(args, id, userID)
	if _, err := s.db.ExecContext(ctx, `UPDATE calendar_subscriptions SET `+strings.Join(set, ", ")+` WHERE id = ? AND user_id = ?`, args...); err != nil {
		return nil, err
	}
	return s.Get(ctx, userID, id)
}

// Delete removes a subscription and its occurrences.
func (s *Store) Delete(ctx context.Context, userID, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM calendar_subscriptions WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// interval is how long to wait after a successful fetch: the calendar's hint
// within bounds, else the default.
func interval(refresh *int64) time.Duration {
	if refresh == nil {
		return DefaultInterval
	}
	d := time.Duration(*refresh) * time.Second
	return min(max(d, MinInterval), MaxInterval)
}

// Success records a fetch that brought new content: the occurrences replace the
// stored ones in one transaction.
func (s *Store) Success(ctx context.Context, id string, r *Result) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := s.now()
	if r.Replaced {
		if _, err := tx.ExecContext(ctx, `DELETE FROM calendar_events WHERE subscription_id = ?`, id); err != nil {
			return err
		}
		stmt, err := tx.PrepareContext(ctx, `INSERT OR REPLACE INTO calendar_events(subscription_id,uid,instance,summary,location,start_date,start_time,start_tz,end_date,end_time,end_tz,all_day,free,start_ms,end_ms)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
		if err != nil {
			return err
		}
		defer stmt.Close()
		for _, o := range r.Occurrences {
			sd, st, sz := pointParts(o.Start)
			ed, et, ez := pointParts(o.End)
			if _, err := stmt.ExecContext(ctx, id, o.UID, o.Instance, o.Summary, o.Location, sd, st, sz, ed, et, ez, boolInt(o.AllDay), boolInt(o.Free), pointMs(o.Start), pointMs(o.End)); err != nil {
				return err
			}
		}
	}
	var refresh any
	if r.RefreshSeconds != nil {
		refresh = *r.RefreshSeconds
	}
	warns, _ := json.Marshal(nonNil(r.Warnings))
	next := now.Add(interval(r.RefreshSeconds)).UnixMilli()
	q := `UPDATE calendar_subscriptions SET etag = ?, last_modified = ?, refresh_seconds = COALESCE(?, refresh_seconds), interval_seconds = ?, next_fetch_at = ?,
		last_fetch_at = ?, last_success_at = ?, last_error = '', stopped_reason = NULL, updated_at = ?`
	args := []any{r.ETag, r.LastModified, refresh, int64(interval(r.RefreshSeconds) / time.Second), next, now.UnixMilli(), now.UnixMilli(), now.UnixMilli()}
	if r.Replaced {
		q += `, warnings = ?, event_count = ?`
		args = append(args, string(warns), len(r.Occurrences))
	}
	if r.Name != "" {
		q += `, name = CASE WHEN name = '' THEN ? ELSE name END`
		args = append(args, r.Name)
	}
	args = append(args, id)
	if _, err := tx.ExecContext(ctx, q+` WHERE id = ?`, args...); err != nil {
		return err
	}
	return tx.Commit()
}

// Failure records a failed fetch: the interval doubles from BackoffStart up to
// BackoffMax; a private target stops polling until the user enables it again.
func (s *Store) Failure(ctx context.Context, id, reason string) error {
	sub, err := s.byID(ctx, id)
	if err != nil {
		return err
	}
	now := s.now()
	next := BackoffStart
	if sub.LastError != "" {
		next = min(time.Duration(sub.IntervalSeconds)*time.Second*2, BackoffMax)
	}
	var stopped any
	if reason == "private_target" {
		stopped = reason
	}
	_, err = s.db.ExecContext(ctx, `UPDATE calendar_subscriptions SET last_error = ?, last_fetch_at = ?, interval_seconds = ?, next_fetch_at = ?, stopped_reason = ?, updated_at = ? WHERE id = ?`,
		reason, now.UnixMilli(), int64(next/time.Second), now.Add(next).UnixMilli(), stopped, now.UnixMilli(), id)
	return err
}

// Due lists the subscriptions to fetch now: enabled, not stopped, next_fetch_at passed.
func (s *Store) Due(ctx context.Context, limit int) ([]Subscription, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+subColumns+` FROM calendar_subscriptions
		WHERE enabled = 1 AND stopped_reason IS NULL AND next_fetch_at <= ? ORDER BY next_fetch_at LIMIT ?`, s.now().UnixMilli(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Subscription
	for rows.Next() {
		sub, err := scanSub(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sub)
	}
	return out, rows.Err()
}

func nonNil(l []string) []string {
	if l == nil {
		return []string{}
	}
	return l
}

// pointParts splits a point into the stored date, time and zone.
func pointParts(p Point) (date string, clock, zone any) {
	if p.AllDay {
		return p.T.Format("2006-01-02"), nil, nil
	}
	if p.Zone == "" {
		return p.T.Format("2006-01-02"), p.T.Format("15:04"), nil
	}
	return p.T.Format("2006-01-02"), p.T.Format("15:04"), p.Zone
}

// pointMs is the instant used for range queries; floating and all-day times
// count as UTC wall times.
func pointMs(p Point) int64 {
	if p.AllDay || p.Zone == "" {
		y, m, d := p.T.Date()
		h, mi, s := p.T.Clock()
		return time.Date(y, m, d, h, mi, s, 0, time.UTC).UnixMilli()
	}
	return p.T.UnixMilli()
}

// When is one end of an event in the API, shaped like a task's due.
type When struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
	TZ   *string `json:"tz,omitempty"`
}

// EventRow is a stored occurrence as the API serves it.
type EventRow struct {
	ID             string `json:"id"`
	SubscriptionID string `json:"subscriptionId"`
	UID            string `json:"uid"`
	Summary        string `json:"summary"`
	Location       string `json:"location"`
	Start          When   `json:"start"`
	End            When   `json:"end"`
	AllDay         bool   `json:"allDay"`
	Free           bool   `json:"free"`
}

// Events returns the occurrences of the user's enabled subscriptions that
// touch the calendar days [from, to] ("YYYY-MM-DD"). Zoned times are kept when
// they overlap the days in any zone; floating and all-day ones by their dates.
func (s *Store) Events(ctx context.Context, userID, from, to string) ([]EventRow, error) {
	f, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, err
	}
	t, err := time.Parse("2006-01-02", to)
	if err != nil {
		return nil, err
	}
	lo := f.Add(-14 * time.Hour).UnixMilli()
	hi := t.Add(24*time.Hour + 14*time.Hour).UnixMilli()
	rows, err := s.db.QueryContext(ctx, `SELECT e.subscription_id, e.uid, e.instance, e.summary, e.location, e.start_date, e.start_time, e.start_tz,
		e.end_date, e.end_time, e.end_tz, e.all_day, e.free, e.start_ms, e.end_ms
		FROM calendar_events e JOIN calendar_subscriptions s ON s.id = e.subscription_id
		WHERE s.user_id = ? AND s.enabled = 1 AND e.start_ms < ? AND e.end_ms >= ? ORDER BY e.start_ms, e.uid`, userID, hi, lo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []EventRow{}
	for rows.Next() {
		var r EventRow
		var instance string
		var st, sz, et, ez sql.NullString
		var allDay, free int
		var startMs, endMs int64
		if err := rows.Scan(&r.SubscriptionID, &r.UID, &instance, &r.Summary, &r.Location, &r.Start.Date, &st, &sz, &r.End.Date, &et, &ez, &allDay, &free, &startMs, &endMs); err != nil {
			return nil, err
		}
		r.AllDay, r.Free = allDay == 1, free == 1
		r.Start.Time, r.Start.TZ = nullPtr(st), nullPtr(sz)
		r.End.Time, r.End.TZ = nullPtr(et), nullPtr(ez)
		if r.Start.TZ == nil {
			// Floating and all-day: by date. An all-day end is exclusive.
			last := r.End.Date
			if r.AllDay || last < r.Start.Date {
				if d, err := time.Parse("2006-01-02", r.End.Date); err == nil {
					last = d.AddDate(0, 0, -1).Format("2006-01-02")
				}
				if last < r.Start.Date {
					last = r.Start.Date
				}
			}
			if last < from || r.Start.Date > to {
				continue
			}
		}
		sum := sha256.Sum256([]byte(r.SubscriptionID + "\x00" + r.UID + "\x00" + instance))
		r.ID = hex.EncodeToString(sum[:12])
		out = append(out, r)
	}
	return out, rows.Err()
}

func nullPtr(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	return &v.String
}

// ---- the task feed's secret (design D7) ----

// Feed describes the user's feed token, never the secret.
type Feed struct {
	CreatedAt  int64  `json:"createdAt"`
	LastUsedAt *int64 `json:"lastUsedAt"`
}

func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

// Feed returns the user's feed token, or nil.
func (s *Store) Feed(ctx context.Context, userID string) (*Feed, error) {
	var f Feed
	var used sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT created_at, last_used_at FROM calendar_feed_tokens WHERE user_id = ?`, userID).Scan(&f.CreatedAt, &used)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if used.Valid {
		f.LastUsedAt = &used.Int64
	}
	return &f, nil
}

// RotateFeed creates the user's feed secret, replacing any previous one, and
// returns it: the only time it exists in clear.
func (s *Store) RotateFeed(ctx context.Context, userID string) (string, *Feed, error) {
	secret := FeedPrefix + ids.Secret(32)
	now := s.now().UnixMilli()
	if _, err := s.db.ExecContext(ctx, `INSERT OR REPLACE INTO calendar_feed_tokens(user_id, hash, created_at, last_used_at) VALUES(?,?,?,NULL)`, userID, hashSecret(secret), now); err != nil {
		return "", nil, err
	}
	return secret, &Feed{CreatedAt: now}, nil
}

// RevokeFeed deletes the user's feed secret; false when there was none.
func (s *Store) RevokeFeed(ctx context.Context, userID string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM calendar_feed_tokens WHERE user_id = ?`, userID)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// FeedUser finds the active account a feed secret belongs to.
func (s *Store) FeedUser(ctx context.Context, secret string) (string, bool) {
	if !strings.HasPrefix(secret, FeedPrefix) {
		return "", false
	}
	h := hashSecret(secret)
	var userID, stored string
	err := s.db.QueryRowContext(ctx, `SELECT t.user_id, t.hash FROM calendar_feed_tokens t JOIN users u ON u.id = t.user_id
		WHERE t.hash = ? AND u.id NOT IN (SELECT user_id FROM user_status WHERE deactivated_at IS NOT NULL)`, h).Scan(&userID, &stored)
	if err != nil || subtle.ConstantTimeCompare([]byte(stored), []byte(h)) != 1 {
		return "", false
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE calendar_feed_tokens SET last_used_at = ? WHERE user_id = ?`, s.now().UnixMilli(), userID)
	return userID, true
}
