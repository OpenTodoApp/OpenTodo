package calsync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// Store keeps connections, links and pending Google sign-ins in SQLite.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// NewStore wires a store on the server database.
func NewStore(db *sql.DB) *Store { return &Store{db: db, now: time.Now} }

// SetClock replaces the store's clock (tests).
func (s *Store) SetClock(now func() time.Time) { s.now = now }

const connColumns = `id, user_id, provider, name, server_url, username, principal_url, home_url, calendars, target_url, read_urls,
	include_date_only, sync_token, ctag, enabled, next_sync_at, backoff_seconds, last_sync_at, last_success_at, last_error,
	last_error_at, COALESCE(stopped_reason,''), last_run, created_at, updated_at`

func scanConn(row interface{ Scan(...any) error }) (*Connection, error) {
	var c Connection
	var cals, reads, run string
	var dateOnly, enabled int
	var lastSync, lastSuccess, lastErrAt sql.NullInt64
	if err := row.Scan(&c.ID, &c.UserID, &c.Provider, &c.Name, &c.ServerURL, &c.Username, &c.PrincipalURL, &c.HomeURL, &cals, &c.TargetURL, &reads,
		&dateOnly, &c.SyncToken, &c.CTag, &enabled, &c.NextSyncAt, &c.BackoffSeconds, &lastSync, &lastSuccess, &c.LastError,
		&lastErrAt, &c.StoppedReason, &run, &c.CreatedAt, &c.UpdatedAt); err != nil {
		return nil, err
	}
	c.IncludeDateOnly, c.Enabled = dateOnly == 1, enabled == 1
	c.LastSyncAt, c.LastSuccessAt, c.LastErrorAt = nullInt(lastSync), nullInt(lastSuccess), nullInt(lastErrAt)
	_ = json.Unmarshal([]byte(cals), &c.Calendars)
	_ = json.Unmarshal([]byte(reads), &c.ReadURLs)
	if c.Calendars == nil {
		c.Calendars = []Calendar{}
	}
	if c.ReadURLs == nil {
		c.ReadURLs = []string{}
	}
	var r RunCounts
	if run != "" && run != "{}" && json.Unmarshal([]byte(run), &r) == nil {
		c.LastRun = &r
	}
	return &c, nil
}

func nullInt(v sql.NullInt64) *int64 {
	if !v.Valid {
		return nil
	}
	return &v.Int64
}

func jsonText(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func (s *Store) many(ctx context.Context, q string, args ...any) ([]Connection, error) {
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Connection{}
	for rows.Next() {
		c, err := scanConn(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

// List returns the user's connections in creation order.
func (s *Store) List(ctx context.Context, userID string) ([]Connection, error) {
	return s.many(ctx, `SELECT `+connColumns+` FROM calsync_connections WHERE user_id = ? ORDER BY created_at, id`, userID)
}

// Get returns one of the user's connections (ErrNotFound for anyone else's).
func (s *Store) Get(ctx context.Context, userID, id string) (*Connection, error) {
	c, err := scanConn(s.db.QueryRowContext(ctx, `SELECT `+connColumns+` FROM calsync_connections WHERE id = ? AND user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return c, err
}

// ByID loads a connection for the worker.
func (s *Store) ByID(ctx context.Context, id string) (*Connection, error) {
	c, err := scanConn(s.db.QueryRowContext(ctx, `SELECT `+connColumns+` FROM calsync_connections WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return c, err
}

// IDs returns the ids of every connection (the secrets sweep).
func (s *Store) IDs(ctx context.Context) (map[string]bool, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM calsync_connections`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// Create stores a new connection from discovery, without a target calendar
// (ErrLimit beyond MaxConnections).
func (s *Store) Create(ctx context.Context, c *Connection) (*Connection, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM calsync_connections WHERE user_id = ?`, c.UserID).Scan(&n); err != nil {
		return nil, err
	}
	if n >= MaxConnections {
		return nil, ErrLimit
	}
	if c.ID == "" {
		c.ID = ids.New()
	}
	now := s.now().UnixMilli()
	if _, err := tx.ExecContext(ctx, `INSERT INTO calsync_connections(id,user_id,provider,name,server_url,username,principal_url,home_url,calendars,
		enabled,next_sync_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?)`,
		c.ID, c.UserID, c.Provider, c.Name, c.ServerURL, c.Username, c.PrincipalURL, c.HomeURL, jsonText(nonNilCals(c.Calendars)), now, now, now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.ByID(ctx, c.ID)
}

func nonNilCals(l []Calendar) []Calendar {
	if l == nil {
		return []Calendar{}
	}
	return l
}

// SaveDiscovery records a new discovery: the principal, home and calendars. A
// target or read calendar that is gone is dropped (the target then has to be
// chosen again).
func (s *Store) SaveDiscovery(ctx context.Context, c *Connection, principal, home string, cals []Calendar) error {
	known := map[string]bool{}
	for _, cal := range cals {
		known[cal.URL] = true
	}
	target := c.TargetURL
	if target != "" && !known[target] {
		target = ""
	}
	reads := []string{}
	for _, u := range c.ReadURLs {
		if known[u] {
			reads = append(reads, u)
		}
	}
	_, err := s.db.ExecContext(ctx, `UPDATE calsync_connections SET principal_url = ?, home_url = ?, calendars = ?, target_url = ?, read_urls = ?,
		updated_at = ? WHERE id = ?`, principal, home, jsonText(nonNilCals(cals)), target, jsonText(reads), s.now().UnixMilli(), c.ID)
	return err
}

// Patch is a partial update of a connection.
type Patch struct {
	Name            *string
	TargetURL       *string
	ReadURLs        *[]string
	IncludeDateOnly *bool
	Enabled         *bool
}

// Update applies a patch. A new target forgets the old calendar's links, sync
// token and CTag and clears a calendar_missing stop; any calendar choice makes
// the connection due now; enabling clears a stop that is not about
// credentials.
func (s *Store) Update(ctx context.Context, userID, id string, p Patch) (*Connection, error) {
	cur, err := s.Get(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	now := s.now().UnixMilli()
	set := []string{"updated_at = ?"}
	args := []any{now}
	due := false
	if p.Name != nil {
		set, args = append(set, "name = ?"), append(args, *p.Name)
	}
	if p.TargetURL != nil && *p.TargetURL != cur.TargetURL {
		set = append(set, "target_url = ?", "sync_token = ''", "ctag = ''")
		args = append(args, *p.TargetURL)
		if cur.StoppedReason == ReasonCalendarMissing {
			set = append(set, "stopped_reason = NULL")
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM calsync_links WHERE connection_id = ?`, id); err != nil {
			return nil, err
		}
		due = true
	}
	if p.ReadURLs != nil {
		set, args = append(set, "read_urls = ?"), append(args, jsonText(*p.ReadURLs))
		due = true
	}
	if p.IncludeDateOnly != nil {
		set, args = append(set, "include_date_only = ?"), append(args, *p.IncludeDateOnly)
		due = true
	}
	if p.Enabled != nil {
		set, args = append(set, "enabled = ?"), append(args, *p.Enabled)
		if *p.Enabled && !cur.Enabled {
			due = true
			if cur.StoppedReason != "" && cur.StoppedReason != ReasonUnauthorized && cur.StoppedReason != ReasonSecretMissing {
				set = append(set, "stopped_reason = NULL")
			}
		}
	}
	if due {
		set = append(set, "next_sync_at = ?", "backoff_seconds = 0")
		args = append(args, now)
	}
	args = append(args, id, userID)
	if _, err := tx.ExecContext(ctx, `UPDATE calsync_connections SET `+strings.Join(set, ", ")+` WHERE id = ? AND user_id = ?`, args...); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.Get(ctx, userID, id)
}

// Resume clears a stop and the backoff and makes the connection due now (a new
// password, a Google reconnect, Sync now).
func (s *Store) Resume(ctx context.Context, id string) error {
	now := s.now().UnixMilli()
	_, err := s.db.ExecContext(ctx, `UPDATE calsync_connections SET stopped_reason = NULL, backoff_seconds = 0, next_sync_at = ?, updated_at = ? WHERE id = ?`, now, now, id)
	return err
}

// Delete removes a connection, its links and its managed subscriptions.
func (s *Store) Delete(ctx context.Context, userID, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM calendar_subscriptions WHERE id IN (SELECT subscription_id FROM calsync_calendars WHERE connection_id = ?)`, id); err != nil {
		return err
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM calsync_connections WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

// syncable is the condition of a connection that cycles run for.
const syncable = `enabled = 1 AND stopped_reason IS NULL AND target_url != ''`

// Due lists the connections to sync now.
func (s *Store) Due(ctx context.Context, limit int) ([]Connection, error) {
	return s.many(ctx, `SELECT `+connColumns+` FROM calsync_connections WHERE `+syncable+` AND next_sync_at <= ? ORDER BY next_sync_at LIMIT ?`, s.now().UnixMilli(), limit)
}

// NextDue is the earliest time a connection is due; ok is false when none is
// (a host's "next due" index).
func (s *Store) NextDue(ctx context.Context) (time.Time, bool, error) {
	var at sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `SELECT MIN(next_sync_at) FROM calsync_connections WHERE `+syncable).Scan(&at); err != nil || !at.Valid {
		return time.Time{}, false, err
	}
	return time.UnixMilli(at.Int64), true, nil
}

// AnySyncable reports whether any connection on the server is synced (the
// observer does nothing while none is).
func (s *Store) AnySyncable(ctx context.Context) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM (SELECT 1 FROM calsync_connections WHERE `+syncable+` LIMIT 1)`).Scan(&n)
	return n > 0, err
}

// DueSoon makes the syncable connections of users due at at, unless they
// already are sooner (the debounced trigger, design D9).
func (s *Store) DueSoon(ctx context.Context, userIDs []string, at time.Time) error {
	if len(userIDs) == 0 {
		return nil
	}
	args := []any{at.UnixMilli()}
	for _, u := range userIDs {
		args = append(args, u)
	}
	args = append(args, at.UnixMilli())
	_, err := s.db.ExecContext(ctx, `UPDATE calsync_connections SET next_sync_at = ? WHERE user_id IN (?`+strings.Repeat(",?", len(userIDs)-1)+`)
		AND `+syncable+` AND next_sync_at > ?`, args...)
	return err
}

// Success records a cycle that completed: the target's sync token and CTag,
// the counts, and the next cycle (sooner when it was partial).
func (s *Store) Success(ctx context.Context, id, syncToken, ctag string, counts RunCounts) error {
	now := s.now()
	next := now.Add(SyncInterval)
	if counts.Partial {
		next = now.Add(Debounce)
	}
	_, err := s.db.ExecContext(ctx, `UPDATE calsync_connections SET sync_token = ?, ctag = ?, last_run = ?, last_sync_at = ?, last_success_at = ?,
		last_error = '', last_error_at = NULL, backoff_seconds = 0, next_sync_at = ?, updated_at = ? WHERE id = ?`,
		syncToken, ctag, jsonText(counts), now.UnixMilli(), now.UnixMilli(), next.UnixMilli(), now.UnixMilli(), id)
	return err
}

// Failure records a failed cycle: the wait doubles from BackoffStart up to
// BackoffMax (or follows the server's Retry-After), and a stopping reason stops
// the connection. The partial counts are kept.
func (s *Store) Failure(ctx context.Context, c *Connection, reason string, until time.Time, counts RunCounts) error {
	now := s.now()
	wait := BackoffStart
	if c.BackoffSeconds > 0 {
		wait = min(time.Duration(c.BackoffSeconds)*time.Second*2, BackoffMax)
	}
	next := now.Add(wait)
	if until.After(next) {
		next = until
	}
	var stopped any
	if Stops(reason) {
		stopped = reason
	}
	_, err := s.db.ExecContext(ctx, `UPDATE calsync_connections SET last_error = ?, last_error_at = ?, last_sync_at = ?, backoff_seconds = ?,
		next_sync_at = ?, stopped_reason = COALESCE(?, stopped_reason), last_run = ?, updated_at = ? WHERE id = ?`,
		reason, now.UnixMilli(), now.UnixMilli(), int64(wait/time.Second), next.UnixMilli(), stopped, jsonText(counts), now.UnixMilli(), c.ID)
	return err
}

// ---- links (design D6) ----

// Link is the event a connection wrote for a task.
type Link struct {
	TaskID   string
	Href     string
	ETag     string
	Snapshot Snapshot
}

// Links returns a connection's links by task id.
func (s *Store) Links(ctx context.Context, connID string) (map[string]*Link, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT task_id, href, etag, snapshot FROM calsync_links WHERE connection_id = ?`, connID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]*Link{}
	for rows.Next() {
		var l Link
		var snap string
		if err := rows.Scan(&l.TaskID, &l.Href, &l.ETag, &snap); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(snap), &l.Snapshot)
		out[l.TaskID] = &l
	}
	return out, rows.Err()
}

// LinkCounts returns the number of events each of the user's connections wrote.
func (s *Store) LinkCounts(ctx context.Context, userID string) (map[string]int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT l.connection_id, COUNT(*) FROM calsync_links l JOIN calsync_connections c ON c.id = l.connection_id
		WHERE c.user_id = ? GROUP BY l.connection_id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, err
		}
		out[id] = n
	}
	return out, rows.Err()
}

// SaveLink stores or replaces a link.
func (s *Store) SaveLink(ctx context.Context, connID string, l *Link) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO calsync_links(connection_id, task_id, href, etag, snapshot, synced_at) VALUES(?,?,?,?,?,?)
		ON CONFLICT(connection_id, task_id) DO UPDATE SET href = excluded.href, etag = excluded.etag, snapshot = excluded.snapshot, synced_at = excluded.synced_at`,
		connID, l.TaskID, l.Href, l.ETag, jsonText(l.Snapshot), s.now().UnixMilli())
	return err
}

// DeleteLink forgets a link.
func (s *Store) DeleteLink(ctx context.Context, connID, taskID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM calsync_links WHERE connection_id = ? AND task_id = ?`, connID, taskID)
	return err
}

// ---- pending Google sign-ins (design D13) ----

// OAuthState is a pending Google sign-in.
type OAuthState struct {
	UserID       string
	Verifier     string
	ConnectionID string
	RedirectURI  string
}

// PutState stores a pending sign-in under the hash of its state for ttl, and
// drops expired ones.
func (s *Store) PutState(ctx context.Context, stateHash string, st OAuthState, ttl time.Duration) error {
	now := s.now()
	if _, err := s.db.ExecContext(ctx, `DELETE FROM calsync_oauth WHERE expires_at < ?`, now.UnixMilli()); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO calsync_oauth(state_hash, user_id, verifier, connection_id, redirect_uri, expires_at) VALUES(?,?,?,?,?,?)`,
		stateHash, st.UserID, st.Verifier, st.ConnectionID, st.RedirectURI, now.Add(ttl).UnixMilli())
	return err
}

// TakeState removes and returns a pending sign-in that has not expired (single use).
func (s *Store) TakeState(ctx context.Context, stateHash string) (*OAuthState, error) {
	var st OAuthState
	var exp int64
	err := s.db.QueryRowContext(ctx, `DELETE FROM calsync_oauth WHERE state_hash = ? RETURNING user_id, verifier, connection_id, redirect_uri, expires_at`, stateHash).
		Scan(&st.UserID, &st.Verifier, &st.ConnectionID, &st.RedirectURI, &exp)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && exp < s.now().UnixMilli()) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &st, nil
}
