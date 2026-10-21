package rules

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// Run log bounds (spec "Run log").
const (
	KeepRuns    = 100
	KeepRunsFor = 30 * 24 * time.Hour
)

// Run outcomes (spec "Run log").
const (
	OutcomePending        = "pending"
	OutcomeApplied        = "applied"
	OutcomeAlreadyMatched = "already_matched"
	OutcomeSkipped        = "skipped"
	OutcomeStopped        = "stopped"
	OutcomeFailed         = "failed"
	OutcomePartial        = "partial"
)

// PausedRunaway is the server's pause of a rule that ran too often (design D8).
const PausedRunaway = "runaway"

// Event is one queued trigger occurrence: a task event from a committed batch,
// or a time trigger the scheduler found (RuleID and Occurrence set).
type Event struct {
	ID         int64
	UserID     string
	RuleID     string
	TaskID     string
	Kind       string
	LabelID    string
	ProjectID  string
	SectionID  string
	Origin     string
	Occurrence string
	Depth      int
	CreatedAt  int64
}

// Run is one row of a rule's run log.
type Run struct {
	ID            int64           `json:"id"`
	RuleID        string          `json:"rule_id"`
	OccurrenceKey string          `json:"occurrence"`
	TaskID        string          `json:"task_id,omitempty"`
	At            int64           `json:"at"`
	Outcome       string          `json:"outcome"`
	Reason        string          `json:"reason,omitempty"`
	Changes       json.RawMessage `json:"changes"`
	Depth         int             `json:"depth"`
}

// State is a rule's server state: its watermark for time triggers, the
// server's pause and the per-minute refusals of the last hour.
type State struct {
	Watermark    int64
	PausedReason string
	Refusals     []int64
}

// Store is the engine's tables (migration 0042_rules_engine.sql).
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// NewStore wraps the server database.
func NewStore(db *sql.DB) *Store { return &Store{db: db, now: time.Now} }

// SetClock replaces the store's clock (tests).
func (s *Store) SetClock(now func() time.Time) { s.now = now }

// Enqueue inserts events in order.
func (s *Store) Enqueue(ctx context.Context, events []Event) error {
	if len(events) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	now := s.now().UnixMilli()
	for _, e := range events {
		if e.Depth < 1 {
			e.Depth = 1
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO rule_events (user_id, rule_id, task_id, kind, label_id, project_id, section_id, origin, occurrence, depth, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, e.UserID, e.RuleID, e.TaskID, e.Kind, e.LabelID, e.ProjectID, e.SectionID, e.Origin, e.Occurrence, e.Depth, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Take returns up to limit queued events, oldest first (so one user's events
// keep the order of their batches).
func (s *Store) Take(ctx context.Context, limit int) ([]Event, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, rule_id, task_id, kind, label_id, project_id, section_id, origin, occurrence, depth, created_at
		FROM rule_events ORDER BY id LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.UserID, &e.RuleID, &e.TaskID, &e.Kind, &e.LabelID, &e.ProjectID, &e.SectionID, &e.Origin, &e.Occurrence, &e.Depth, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// Done removes a processed event.
func (s *Store) Done(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM rule_events WHERE id = ?`, id)
	return err
}

// Pending counts the queued events (tests, the status line).
func (s *Store) Pending(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM rule_events`).Scan(&n)
	return n, err
}

// Claim records a run's key with outcome pending. It reports false, and
// changes nothing, when the key was already recorded: a replayed event, a
// retried pass or an overlapping one (spec "Idempotent runs").
func (s *Store) Claim(ctx context.Context, userID string, r Run) (int64, bool, error) {
	if r.Depth < 1 {
		r.Depth = 1
	}
	res, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO rule_runs (rule_id, user_id, occurrence_key, task_id, at, outcome, reason, changes_json, depth)
		VALUES (?, ?, ?, ?, ?, ?, '', '[]', ?)`, r.RuleID, userID, r.OccurrenceKey, r.TaskID, s.now().UnixMilli(), OutcomePending, r.Depth)
	if err != nil {
		return 0, false, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		// A run left pending by a crash between the claim and the write is
		// resumed: its ops have derived ids, so what was written is a duplicate.
		var id int64
		var outcome string
		err := s.db.QueryRowContext(ctx, `SELECT id, outcome FROM rule_runs WHERE rule_id = ? AND occurrence_key = ?`, r.RuleID, r.OccurrenceKey).Scan(&id, &outcome)
		if err != nil || outcome != OutcomePending {
			return 0, false, err
		}
		return id, true, nil
	}
	id, err := res.LastInsertId()
	return id, true, err
}

// Finish sets a claimed run's outcome.
func (s *Store) Finish(ctx context.Context, id int64, outcome, reason string, changes any) error {
	if changes == nil {
		changes = []any{}
	}
	b, err := json.Marshal(changes)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE rule_runs SET outcome = ?, reason = ?, changes_json = ? WHERE id = ?`, outcome, reason, string(b), id)
	return err
}

// Record inserts a finished run in one step (limits, stops: nothing to write).
func (s *Store) Record(ctx context.Context, userID string, r Run) error {
	id, ok, err := s.Claim(ctx, userID, r)
	if err != nil || !ok {
		return err
	}
	return s.Finish(ctx, id, r.Outcome, r.Reason, nil)
}

// Runs lists a rule's runs, newest first.
func (s *Store) Runs(ctx context.Context, ruleID string, limit int) ([]Run, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, rule_id, occurrence_key, task_id, at, outcome, reason, changes_json, depth
		FROM rule_runs WHERE rule_id = ? ORDER BY at DESC, id DESC LIMIT ?`, ruleID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Run{}
	for rows.Next() {
		var r Run
		var changes string
		if err := rows.Scan(&r.ID, &r.RuleID, &r.OccurrenceKey, &r.TaskID, &r.At, &r.Outcome, &r.Reason, &changes, &r.Depth); err != nil {
			return nil, err
		}
		r.Changes = json.RawMessage(changes)
		out = append(out, r)
	}
	return out, rows.Err()
}

// Summary is a rule's last run time and its run count for the last 7 days.
type Summary struct {
	LastRun int64 `json:"last_run,omitempty"`
	Week    int   `json:"runs_7d"`
}

// Summaries returns the run summary of every rule of a user that has runs.
func (s *Store) Summaries(ctx context.Context, userID string) (map[string]Summary, error) {
	since := s.now().Add(-7 * 24 * time.Hour).UnixMilli()
	rows, err := s.db.QueryContext(ctx, `SELECT rule_id, MAX(at), SUM(CASE WHEN at >= ? AND outcome IN ('applied', 'partial') THEN 1 ELSE 0 END)
		FROM rule_runs WHERE user_id = ? AND outcome != 'pending' GROUP BY rule_id`, since, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]Summary{}
	for rows.Next() {
		var id string
		var sum Summary
		if err := rows.Scan(&id, &sum.LastRun, &sum.Week); err != nil {
			return nil, err
		}
		out[id] = sum
	}
	return out, rows.Err()
}

// State reads a rule's state; a rule without a row has the zero state.
func (s *Store) State(ctx context.Context, ruleID string) (State, bool, error) {
	var st State
	var refusals string
	err := s.db.QueryRowContext(ctx, `SELECT watermark_ms, paused_reason, refusals FROM rule_state WHERE rule_id = ?`, ruleID).Scan(&st.Watermark, &st.PausedReason, &refusals)
	if errors.Is(err, sql.ErrNoRows) {
		return State{}, false, nil
	}
	if err != nil {
		return State{}, false, err
	}
	_ = json.Unmarshal([]byte(refusals), &st.Refusals)
	return st, true, nil
}

// SaveState writes a rule's state.
func (s *Store) SaveState(ctx context.Context, ruleID, userID string, st State) error {
	if st.Refusals == nil {
		st.Refusals = []int64{}
	}
	b, _ := json.Marshal(st.Refusals)
	_, err := s.db.ExecContext(ctx, `INSERT INTO rule_state (rule_id, user_id, watermark_ms, paused_reason, refusals) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(rule_id) DO UPDATE SET watermark_ms = excluded.watermark_ms, paused_reason = excluded.paused_reason, refusals = excluded.refusals`,
		ruleID, userID, st.Watermark, st.PausedReason, string(b))
	return err
}

// Paused lists the server-paused rules of a user with their reasons.
func (s *Store) Paused(ctx context.Context, userID string) (map[string]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT rule_id, paused_reason FROM rule_state WHERE user_id = ? AND paused_reason != ''`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, reason string
		if err := rows.Scan(&id, &reason); err != nil {
			return nil, err
		}
		out[id] = reason
	}
	return out, rows.Err()
}

// UserPaused reports whether a user paused all their rules.
func (s *Store) UserPaused(ctx context.Context, userID string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_rules_paused WHERE user_id = ?`, userID).Scan(&n)
	return n > 0, err
}

// SetUserPaused pauses or resumes all of a user's rules.
func (s *Store) SetUserPaused(ctx context.Context, userID string, paused bool) error {
	if !paused {
		_, err := s.db.ExecContext(ctx, `DELETE FROM user_rules_paused WHERE user_id = ?`, userID)
		return err
	}
	_, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO user_rules_paused (user_id, paused_at) VALUES (?, ?)`, userID, s.now().UnixMilli())
	return err
}

// Prune keeps each rule's newest KeepRuns runs younger than KeepRunsFor.
func (s *Store) Prune(ctx context.Context) (int64, error) {
	cutoff := s.now().Add(-KeepRunsFor).UnixMilli()
	res, err := s.db.ExecContext(ctx, `DELETE FROM rule_runs WHERE outcome != 'pending' AND (at < ? OR id IN (
		SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY at DESC, id DESC) AS n FROM rule_runs) WHERE n > ?))`, cutoff, KeepRuns)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
