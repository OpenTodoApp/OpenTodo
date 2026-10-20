// Package issues is issue import (OpenSpec change issue-import): a user's
// connections to GitHub or GitLab, the provider clients built on
// internal/outbound, the mapping of issues to task operations and the poller.
// The HTTP, CLI, MCP and scheduler layers only call into it.
//
// Connections and their links are server data (never operations, never
// synced, never exported); tokens live in <data>/secrets/issues.json. Every
// task and label a poll writes goes through the op log with device
// issues:<connection-id>, and nothing is ever written back to the provider.
package issues

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/ids"
)

// Connection limits (spec "Connection fields", "Filter", design D4).
const (
	MaxConnections      = 5
	MaxRepositories     = 20
	MaxLabels           = 10
	MaxName             = 100
	MaxHost             = 2048
	MinIntervalMinutes  = 15
	MaxIntervalMinutes  = 24 * 60
	DefaultIntervalMins = 30
	// BackoffMax caps the wait after failed polls.
	BackoffMax = 6 * time.Hour
	// ReconcileEvery is how often a poll also lists every open matching issue
	// to find linked issues that no longer match (counted as unlinked).
	ReconcileEvery = 24 * time.Hour
)

// Providers.
const (
	GitHub = "github"
	GitLab = "gitlab"
)

// Scopes of a filter.
const (
	ScopeAssigned     = "assigned"
	ScopeRepositories = "repositories"
)

// Reasons stored on a connection (not HTTP codes; design D10).
const (
	ReasonUnauthorized   = "unauthorized_provider"
	ReasonTokenMissing   = "token_missing"
	ReasonPrivateTarget  = "private_target"
	ReasonRedirect       = "redirect_refused"
	ReasonTooLarge       = "too_large"
	ReasonRateLimited    = "provider_rate_limited"
	ReasonEncrypted      = "encrypted_account"
	ReasonTimeout        = "timeout"
	ReasonConnection     = "connection_failed"
	ReasonInvalidAnswer  = "invalid_response"
	ReasonNotFoundRemote = "provider_not_found"
)

// stopReasons end the schedule until the user acts (spec "Poll backoff").
var stopReasons = map[string]bool{ReasonUnauthorized: true, ReasonTokenMissing: true, ReasonPrivateTarget: true, ReasonEncrypted: true}

// IsStop reports whether reason stops a connection's schedule.
func IsStop(reason string) bool { return stopReasons[reason] }

var (
	// ErrNotFound: no connection with this id belongs to the user.
	ErrNotFound = errors.New("issue connection not found")
	// ErrLimit: the user already has MaxConnections connections.
	ErrLimit = errors.New("limit_reached")
)

// FieldError is an invalid input naming the field it is about.
type FieldError struct {
	Field string
	Msg   string
}

func (e *FieldError) Error() string { return e.Field + ": " + e.Msg }

// Filter selects the issues of a connection (spec "Filter").
type Filter struct {
	Scope        string   `json:"scope"`
	Repositories []string `json:"repositories"`
	Labels       []string `json:"labels"`
}

// Normalize trims entries, drops empty ones and fills the default scope.
func (f Filter) Normalize() Filter {
	clean := func(in []string) []string {
		out := []string{}
		seen := map[string]bool{}
		for _, s := range in {
			s = strings.TrimSpace(s)
			if s == "" || seen[strings.ToLower(s)] {
				continue
			}
			seen[strings.ToLower(s)] = true
			out = append(out, s)
		}
		return out
	}
	if f.Scope == "" {
		f.Scope = ScopeAssigned
	}
	f.Repositories, f.Labels = clean(f.Repositories), clean(f.Labels)
	return f
}

// Validate checks a normalized filter.
func (f Filter) Validate() error {
	switch f.Scope {
	case ScopeAssigned:
	case ScopeRepositories:
		if len(f.Repositories) == 0 {
			return &FieldError{"repositories", "list at least one repository or project for the repositories scope"}
		}
	default:
		return &FieldError{"scope", `scope must be "assigned" or "repositories"`}
	}
	if len(f.Repositories) > MaxRepositories {
		return &FieldError{"repositories", fmt.Sprintf("list at most %d repositories or projects", MaxRepositories)}
	}
	for _, r := range f.Repositories {
		if len(r) > 255 || !strings.Contains(r, "/") || strings.HasPrefix(r, "/") || strings.HasSuffix(r, "/") || strings.ContainsAny(r, " ?#") {
			return &FieldError{"repositories", fmt.Sprintf("%q is not an owner/name or group/project path", r)}
		}
	}
	if len(f.Labels) > MaxLabels {
		return &FieldError{"labels", fmt.Sprintf("list at most %d labels", MaxLabels)}
	}
	for _, l := range f.Labels {
		if len(l) > 255 {
			return &FieldError{"labels", "a label name is at most 255 characters"}
		}
	}
	return nil
}

// RunCounts are the counts of one poll, kept as the connection's last run.
type RunCounts struct {
	Created   int  `json:"created"`
	Completed int  `json:"completed"`
	Reopened  int  `json:"reopened"`
	Renamed   int  `json:"renamed"`
	Unlinked  int  `json:"unlinked"`
	Partial   bool `json:"partial"`
}

// Connection is one issue connection with its status. The token is never part
// of it; TokenSet reports whether one is stored.
type Connection struct {
	ID              string     `json:"id"`
	UserID          string     `json:"-"`
	Provider        string     `json:"provider"`
	Host            string     `json:"host"`
	Name            string     `json:"name"`
	ProjectID       *string    `json:"project_id"`
	Filter          Filter     `json:"filter"`
	MapLabels       bool       `json:"map_labels"`
	Enabled         bool       `json:"enabled"`
	IntervalMinutes int        `json:"interval_minutes"`
	BackoffSeconds  int64      `json:"-"`
	State           string     `json:"state"`
	NextPollAt      int64      `json:"next_poll_at"`
	LastPollAt      *int64     `json:"last_poll_at"`
	LastSuccessAt   *int64     `json:"last_success_at"`
	LastError       string     `json:"last_error"`
	LastErrorAt     *int64     `json:"last_error_at"`
	StoppedReason   string     `json:"stopped_reason"`
	AccountLogin    string     `json:"account_login"`
	CanReadIssues   *bool      `json:"can_read_issues"`
	LastRun         *RunCounts `json:"last_run"`
	TaskCount       int        `json:"task_count"`
	TokenSet        bool       `json:"token_set"`
	CreatedAt       int64      `json:"created_at"`
	UpdatedAt       int64      `json:"updated_at"`

	etags        map[string]string
	sinceMs      int64
	repoIndex    int
	page         int
	reconciledAt int64
}

// Connection states as the API reports them.
const (
	StateOff     = "off"
	StatePending = "pending"
	StateOK      = "ok"
	StateFailed  = "failed"
	StateStopped = "stopped"
)

func (c *Connection) state() string {
	switch {
	case !c.Enabled:
		return StateOff
	case c.StoppedReason != "":
		return StateStopped
	case c.LastError != "":
		return StateFailed
	case c.LastSuccessAt != nil:
		return StateOK
	}
	return StatePending
}

// Link is what the poller last saw of one issue it linked to a task.
type Link struct {
	ConnectionID   string
	IssueKey       string
	TaskID         string
	Title          string
	State          string
	ClosedAt       int64
	Labels         []string
	IssueUpdatedMs int64
	Matched        bool
}

// Store keeps connections and links in SQLite.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// NewStore wires a store on the server database.
func NewStore(db *sql.DB) *Store { return &Store{db: db, now: time.Now} }

// SetClock replaces the store's clock (tests).
func (s *Store) SetClock(now func() time.Time) { s.now = now }

const connColumns = `c.id, c.user_id, c.provider, c.host, c.name, c.project_id, c.filter, c.map_labels, c.enabled, c.interval_seconds, c.backoff_seconds,
	c.next_poll_at, c.last_poll_at, c.last_success_at, c.last_error, c.last_error_at, COALESCE(c.stopped_reason,''), c.etag, c.since_ms, c.repo_index, c.page,
	c.account_login, c.can_read_issues, c.last_run, c.reconciled_at, c.created_at, c.updated_at,
	(SELECT COUNT(*) FROM issue_links l WHERE l.connection_id = c.id)`

func scanConn(row interface{ Scan(...any) error }) (*Connection, error) {
	var c Connection
	var project sql.NullString
	var filter, etags, lastRun string
	var mapLabels, enabled int
	var interval int64
	var lastPoll, lastSuccess, lastErrAt, canRead, reconciled sql.NullInt64
	if err := row.Scan(&c.ID, &c.UserID, &c.Provider, &c.Host, &c.Name, &project, &filter, &mapLabels, &enabled, &interval, &c.BackoffSeconds,
		&c.NextPollAt, &lastPoll, &lastSuccess, &c.LastError, &lastErrAt, &c.StoppedReason, &etags, &c.sinceMs, &c.repoIndex, &c.page,
		&c.AccountLogin, &canRead, &lastRun, &reconciled, &c.CreatedAt, &c.UpdatedAt, &c.TaskCount); err != nil {
		return nil, err
	}
	if project.Valid {
		c.ProjectID = &project.String
	}
	_ = json.Unmarshal([]byte(filter), &c.Filter)
	c.Filter = c.Filter.Normalize()
	c.MapLabels, c.Enabled = mapLabels == 1, enabled == 1
	c.IntervalMinutes = int(interval / 60)
	ptr := func(v sql.NullInt64) *int64 {
		if !v.Valid {
			return nil
		}
		x := v.Int64
		return &x
	}
	c.LastPollAt, c.LastSuccessAt, c.LastErrorAt = ptr(lastPoll), ptr(lastSuccess), ptr(lastErrAt)
	if canRead.Valid {
		b := canRead.Int64 == 1
		c.CanReadIssues = &b
	}
	c.reconciledAt = reconciled.Int64
	c.etags = map[string]string{}
	_ = json.Unmarshal([]byte(etags), &c.etags)
	var run RunCounts
	if json.Unmarshal([]byte(lastRun), &run) == nil && lastRun != "{}" && lastRun != "" {
		c.LastRun = &run
	}
	c.State = c.state()
	return &c, nil
}

func (s *Store) query(ctx context.Context, where string, args ...any) ([]Connection, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+connColumns+` FROM issue_connections c WHERE `+where, args...)
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

func (s *Store) one(ctx context.Context, where string, args ...any) (*Connection, error) {
	list, err := s.query(ctx, where, args...)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, ErrNotFound
	}
	return &list[0], nil
}

// List returns the user's connections in creation order.
func (s *Store) List(ctx context.Context, userID string) ([]Connection, error) {
	return s.query(ctx, `c.user_id = ? ORDER BY c.created_at, c.id`, userID)
}

// Get returns one of the user's connections (ErrNotFound for anyone else's).
func (s *Store) Get(ctx context.Context, userID, id string) (*Connection, error) {
	return s.one(ctx, `c.id = ? AND c.user_id = ?`, id, userID)
}

// ByID loads a connection for the worker.
func (s *Store) ByID(ctx context.Context, id string) (*Connection, error) {
	return s.one(ctx, `c.id = ?`, id)
}

// IDs lists every connection id (secrets housekeeping).
func (s *Store) IDs(ctx context.Context) (map[string]bool, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM issue_connections`)
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

// Input is a new connection, already validated by the caller.
type Input struct {
	Provider        string
	Host            string
	Name            string
	ProjectID       *string
	Filter          Filter
	MapLabels       bool
	IntervalMinutes int
	Enabled         bool
}

// Create stores a connection, due at once; ErrLimit beyond MaxConnections.
func (s *Store) Create(ctx context.Context, userID string, in Input) (*Connection, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM issue_connections WHERE user_id = ?`, userID).Scan(&n); err != nil {
		return nil, err
	}
	if n >= MaxConnections {
		return nil, ErrLimit
	}
	id := ids.New()
	now := s.now().UnixMilli()
	filter, _ := json.Marshal(in.Filter)
	if _, err := tx.ExecContext(ctx, `INSERT INTO issue_connections(id,user_id,provider,host,name,project_id,filter,map_labels,enabled,interval_seconds,next_poll_at,created_at,updated_at)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, userID, in.Provider, in.Host, in.Name, nullStr(in.ProjectID), string(filter), boolInt(in.MapLabels), boolInt(in.Enabled),
		in.IntervalMinutes*60, now, now, now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.Get(ctx, userID, id)
}

// Patch is a partial update. Clear the project with an empty ProjectID.
type Patch struct {
	Host            *string
	Name            *string
	ProjectID       *string
	Filter          *Filter
	MapLabels       *bool
	IntervalMinutes *int
	Enabled         *bool
	// TokenReplaced clears a stop for a token reason and makes the connection due.
	TokenReplaced bool
}

// Update applies a patch. A new host or filter starts the cursor over; enabling
// or a new host clears any stop; a new token clears a token stop.
func (s *Store) Update(ctx context.Context, userID, id string, p Patch) (*Connection, error) {
	cur, err := s.Get(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	now := s.now().UnixMilli()
	set := []string{"updated_at = ?"}
	args := []any{now}
	restart := func() {
		set = append(set, "etag = '{}'", "since_ms = 0", "repo_index = 0", "page = 0", "reconciled_at = NULL")
	}
	unstop := func() {
		set = append(set, "stopped_reason = NULL", "last_error = ''", "backoff_seconds = 0", "next_poll_at = ?")
		args = append(args, now)
	}
	if p.Host != nil {
		set = append(set, "host = ?", "account_login = ''", "can_read_issues = NULL")
		args = append(args, *p.Host)
		restart()
		unstop()
	}
	if p.Name != nil {
		set = append(set, "name = ?")
		args = append(args, *p.Name)
	}
	if p.ProjectID != nil {
		set = append(set, "project_id = ?")
		if *p.ProjectID == "" {
			args = append(args, nil)
		} else {
			args = append(args, *p.ProjectID)
		}
	}
	if p.Filter != nil {
		b, _ := json.Marshal(*p.Filter)
		set = append(set, "filter = ?")
		args = append(args, string(b))
		restart()
	}
	if p.MapLabels != nil {
		set = append(set, "map_labels = ?")
		args = append(args, boolInt(*p.MapLabels))
	}
	if p.IntervalMinutes != nil {
		set = append(set, "interval_seconds = ?")
		args = append(args, *p.IntervalMinutes*60)
	}
	if p.Enabled != nil {
		set = append(set, "enabled = ?")
		args = append(args, boolInt(*p.Enabled))
		if *p.Enabled && (!cur.Enabled || cur.StoppedReason != "") {
			unstop()
		}
	}
	if p.TokenReplaced && p.Host == nil {
		set = append(set, "account_login = ''", "can_read_issues = NULL")
		if cur.StoppedReason == ReasonUnauthorized || cur.StoppedReason == ReasonTokenMissing {
			unstop()
		}
	}
	args = append(args, id, userID)
	if _, err := s.db.ExecContext(ctx, `UPDATE issue_connections SET `+strings.Join(set, ", ")+` WHERE id = ? AND user_id = ?`, args...); err != nil {
		return nil, err
	}
	return s.Get(ctx, userID, id)
}

// Delete removes a connection and its links; the tasks stay.
func (s *Store) Delete(ctx context.Context, userID, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM issue_connections WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// Due lists the connections to poll now: enabled, not stopped, next_poll_at passed.
func (s *Store) Due(ctx context.Context, limit int) ([]Connection, error) {
	return s.query(ctx, `c.enabled = 1 AND c.stopped_reason IS NULL AND c.next_poll_at <= ? ORDER BY c.next_poll_at LIMIT ?`, s.now().UnixMilli(), limit)
}

// NextPoll is the earliest time a connection is due; ok is false when none is
// (the host's "next due" index, OpenSpec `multi-tenant-host`).
func (s *Store) NextPoll(ctx context.Context) (time.Time, bool, error) {
	var at sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT MIN(next_poll_at) FROM issue_connections WHERE enabled = 1 AND stopped_reason IS NULL`).Scan(&at)
	if err != nil || !at.Valid {
		return time.Time{}, false, err
	}
	return time.UnixMilli(at.Int64), true, nil
}

// Account records the result of a token check.
func (s *Store) Account(ctx context.Context, id, login string, canRead bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE issue_connections SET account_login = ?, can_read_issues = ?, updated_at = ? WHERE id = ?`,
		login, boolInt(canRead), s.now().UnixMilli(), id)
	return err
}

// Progress is where a poll got to: the cursor to keep and the counts.
type Progress struct {
	ETags        map[string]string
	SinceMs      int64
	RepoIndex    int
	Page         int
	ReconciledAt int64
	Counts       RunCounts
}

// Success records a poll that ended normally (complete or partial): the
// interval returns to the configured one, or one minute for a partial run.
func (s *Store) Success(ctx context.Context, c *Connection, p Progress) error {
	now := s.now()
	next := now.Add(time.Duration(c.IntervalMinutes) * time.Minute)
	if p.Counts.Partial {
		next = now.Add(time.Minute)
	}
	return s.finish(ctx, c.ID, p, `last_error = '', last_error_at = NULL, backoff_seconds = 0, stopped_reason = NULL, last_success_at = ?, next_poll_at = ?`,
		now.UnixMilli(), next.UnixMilli())
}

// Failure records a failed poll: the wait doubles from the configured interval
// up to BackoffMax; a stop reason ends the schedule. The cursor reached so far
// is kept, so committed pages are not processed again.
func (s *Store) Failure(ctx context.Context, c *Connection, p Progress, reason string) error {
	now := s.now()
	wait := time.Duration(c.BackoffSeconds) * time.Second * 2
	if c.BackoffSeconds == 0 {
		wait = time.Duration(c.IntervalMinutes) * time.Minute * 2
	}
	wait = min(wait, BackoffMax)
	var stopped any
	if IsStop(reason) {
		stopped = reason
	}
	return s.finish(ctx, c.ID, p, `last_error = ?, last_error_at = ?, backoff_seconds = ?, stopped_reason = ?, next_poll_at = ?`,
		reason, now.UnixMilli(), int64(wait/time.Second), stopped, now.Add(wait).UnixMilli())
}

// RateLimited records the provider's rate-limit answer: no request before until,
// the interval unchanged.
func (s *Store) RateLimited(ctx context.Context, c *Connection, p Progress, until time.Time) error {
	now := s.now()
	if !until.After(now) {
		until = now.Add(time.Minute)
	}
	return s.finish(ctx, c.ID, p, `last_error = ?, last_error_at = ?, next_poll_at = ?`, ReasonRateLimited, now.UnixMilli(), until.UnixMilli())
}

func (s *Store) finish(ctx context.Context, id string, p Progress, set string, args ...any) error {
	now := s.now().UnixMilli()
	etags, _ := json.Marshal(nonNilMap(p.ETags))
	run, _ := json.Marshal(p.Counts)
	var reconciled any
	if p.ReconciledAt > 0 {
		reconciled = p.ReconciledAt
	}
	all := append(args, string(etags), p.SinceMs, p.RepoIndex, p.Page, reconciled, string(run), now, now, id)
	_, err := s.db.ExecContext(ctx, `UPDATE issue_connections SET `+set+`, etag = ?, since_ms = ?, repo_index = ?, page = ?, reconciled_at = ?, last_run = ?,
		last_poll_at = ?, updated_at = ? WHERE id = ?`, all...)
	return err
}

// Stop ends a connection's schedule with reason without a poll (token missing,
// encryption enabled).
func (s *Store) Stop(ctx context.Context, id, reason string) error {
	now := s.now().UnixMilli()
	_, err := s.db.ExecContext(ctx, `UPDATE issue_connections SET stopped_reason = ?, last_error = ?, last_error_at = ?, updated_at = ? WHERE id = ?`,
		reason, reason, now, now, id)
	return err
}

// StopUser stops the user's enabled connections that are not stopped yet with
// reason and returns their names (encryption enabled, spec "Encrypted accounts").
func (s *Store) StopUser(ctx context.Context, userID, reason string) ([]string, error) {
	list, err := s.query(ctx, `c.user_id = ? AND c.enabled = 1 AND c.stopped_reason IS NULL ORDER BY c.created_at`, userID)
	if err != nil {
		return nil, err
	}
	names := []string{}
	for _, c := range list {
		if err := s.Stop(ctx, c.ID, reason); err != nil {
			return nil, err
		}
		names = append(names, c.Name)
	}
	return names, nil
}

// Links returns the connection's links by issue key.
func (s *Store) Links(ctx context.Context, connID string) (map[string]*Link, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT issue_key, task_id, title, state, closed_at, labels, issue_updated_ms, matched FROM issue_links WHERE connection_id = ?`, connID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]*Link{}
	for rows.Next() {
		l := &Link{ConnectionID: connID}
		var closed sql.NullInt64
		var labels string
		var matched int
		if err := rows.Scan(&l.IssueKey, &l.TaskID, &l.Title, &l.State, &closed, &labels, &l.IssueUpdatedMs, &matched); err != nil {
			return nil, err
		}
		l.ClosedAt, l.Matched = closed.Int64, matched == 1
		_ = json.Unmarshal([]byte(labels), &l.Labels)
		out[l.IssueKey] = l
	}
	return out, rows.Err()
}

// SaveLinks upserts links in one transaction.
func (s *Store) SaveLinks(ctx context.Context, links []*Link) error {
	if len(links) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := s.now().UnixMilli()
	for _, l := range links {
		labels, _ := json.Marshal(nonNil(l.Labels))
		var closed any
		if l.ClosedAt > 0 {
			closed = l.ClosedAt
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO issue_links(connection_id,issue_key,task_id,title,state,closed_at,labels,issue_updated_ms,matched,created_at)
			VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(connection_id,issue_key) DO UPDATE SET title=excluded.title, state=excluded.state, closed_at=excluded.closed_at,
			labels=excluded.labels, issue_updated_ms=excluded.issue_updated_ms, matched=excluded.matched`,
			l.ConnectionID, l.IssueKey, l.TaskID, l.Title, l.State, closed, string(labels), l.IssueUpdatedMs, boolInt(l.Matched), now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func nullStr(p *string) any {
	if p == nil || *p == "" {
		return nil
	}
	return *p
}

func nonNil(l []string) []string {
	if l == nil {
		return []string{}
	}
	return l
}

func nonNilMap(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}

// CheckInterval validates a poll interval in minutes.
func CheckInterval(m int) error {
	if m < MinIntervalMinutes || m > MaxIntervalMinutes {
		return &FieldError{"interval_minutes", fmt.Sprintf("the interval must be %d minutes to %d hours (the minimum is %d minutes)", MinIntervalMinutes, MaxIntervalMinutes/60, MinIntervalMinutes)}
	}
	return nil
}

// CheckFailed records a failed token check on the connection's status without
// touching its schedule, except that a refused token stops it like a poll
// would (the panel then asks for a new token).
func (s *Store) CheckFailed(ctx context.Context, id, reason string) error {
	now := s.now().UnixMilli()
	var stopped any
	if reason == ReasonUnauthorized {
		stopped = reason
	}
	_, err := s.db.ExecContext(ctx, `UPDATE issue_connections SET last_error = ?, last_error_at = ?, stopped_reason = COALESCE(?, stopped_reason), updated_at = ? WHERE id = ?`,
		reason, now, stopped, now, id)
	return err
}

// CheckSucceeded clears a refused-token error once a check passes again.
func (s *Store) CheckSucceeded(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE issue_connections SET last_error = '', last_error_at = NULL, stopped_reason = NULL, next_poll_at = MIN(next_poll_at, ?)
		WHERE id = ? AND (stopped_reason = ? OR (stopped_reason IS NULL AND last_error = ?))`, s.now().UnixMilli(), id, ReasonUnauthorized, ReasonUnauthorized)
	return err
}
