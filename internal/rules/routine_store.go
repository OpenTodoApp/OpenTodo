package rules

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

// Run records of routines (routines-engine D10, migration 0052_routines.sql):
// ids, counts, status and error codes only, never text.

// Step statuses.
const (
	StepOK          = "ok"
	StepSkipped     = "skipped"
	StepEnded       = "ended"
	StepFailed      = "failed"
	StepUnavailable = "unavailable"
	StepTruncated   = "truncated"
)

// MaxRecordedIDs bounds the ids one step record keeps.
const MaxRecordedIDs = 50

// StepRecord is one step of a run.
type StepRecord struct {
	Idx        int      `json:"index"`
	StepID     string   `json:"step_id"`
	Kind       string   `json:"kind"`
	Status     string   `json:"status"`
	DurationMs int64    `json:"duration_ms"`
	Items      int      `json:"items"`
	OutType    string   `json:"output"`
	IDs        []string `json:"ids"`
	Error      string   `json:"error,omitempty"`
	// Tokens are an AI step's input and output tokens (routines-ai-step D11).
	Tokens int64 `json:"tokens,omitempty"`
}

// written is one entity a run wrote, for Undo: its fields and whether the run created it.
type written struct {
	Entity  string   `json:"e"`
	ID      string   `json:"id"`
	Fields  []string `json:"f"`
	Created bool     `json:"c,omitempty"`
}

// routineFinish is a routine run's outcome and records.
type routineFinish struct {
	Outcome    string
	Reason     string
	Writes     int
	DurationMs int64
	FailedStep int
	Steps      []StepRecord
	Written    []written
	// Tokens are the run's AI tokens; AIAuto marks an AI result applied
	// without asking (routines-ai-step D4).
	Tokens int64
	AIAuto bool
}

// FinishRoutine records a claimed routine run's outcome, counts and step records.
func (s *Store) finishRoutine(ctx context.Context, id int64, runID string, f routineFinish) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if f.Written == nil {
		f.Written = []written{}
	}
	batches, _ := json.Marshal(f.Written)
	if _, err := tx.ExecContext(ctx, `UPDATE rule_runs SET outcome = ?, reason = ?, writes = ?, duration_ms = ?, steps_count = ?, failed_step = ?, batches_json = ?,
		tokens = ?, ai_auto = ? WHERE id = ?`, f.Outcome, f.Reason, f.Writes, f.DurationMs, len(f.Steps), f.FailedStep, string(batches), f.Tokens, f.AIAuto, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM rule_step_runs WHERE run_id = ?`, runID); err != nil {
		return err
	}
	for _, st := range f.Steps {
		if st.IDs == nil {
			st.IDs = []string{}
		}
		if len(st.IDs) > MaxRecordedIDs {
			st.IDs = st.IDs[:MaxRecordedIDs]
		}
		idsJSON, _ := json.Marshal(st.IDs)
		if _, err := tx.ExecContext(ctx, `INSERT INTO rule_step_runs (run_id, idx, step_id, kind, status, duration_ms, items, out_type, ids_json, error, tokens)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, runID, st.Idx, st.StepID, st.Kind, st.Status, st.DurationMs, st.Items, st.OutType, string(idsJSON), st.Error, st.Tokens); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ErrRunNotFound is the answer for a run the user does not own.
var ErrRunNotFound = errors.New("run not found")

// visibleRuns is the condition of the runs a user sees: their own, and a
// shared routine's runs in a project they belong to (routines-shared D7).
const visibleRuns = `(user_id = ? OR (project_id != '' AND project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)))`

// RunByID returns one of the runs the user sees, with its step records.
func (s *Store) RunByID(ctx context.Context, userID, runID string) (Run, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+runColumns+` FROM rule_runs WHERE run_id = ? AND `+visibleRuns, runID, userID, userID)
	if err != nil {
		return Run{}, err
	}
	list, err := scanRuns(rows)
	if err != nil {
		return Run{}, err
	}
	if len(list) == 0 {
		return Run{}, ErrRunNotFound
	}
	r := list[0]
	r.Steps, err = s.stepRecords(ctx, runID)
	return r, err
}

func (s *Store) stepRecords(ctx context.Context, runID string) ([]StepRecord, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT idx, step_id, kind, status, duration_ms, items, out_type, ids_json, error, tokens FROM rule_step_runs WHERE run_id = ? ORDER BY idx`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StepRecord{}
	for rows.Next() {
		var st StepRecord
		var idsJSON string
		if err := rows.Scan(&st.Idx, &st.StepID, &st.Kind, &st.Status, &st.DurationMs, &st.Items, &st.OutType, &idsJSON, &st.Error, &st.Tokens); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(idsJSON), &st.IDs)
		out = append(out, st)
	}
	return out, rows.Err()
}

// RunFilter narrows the all-runs list.
type RunFilter struct {
	Outcome string
	Source  string
	RuleID  string
	// Before pages back: runs older than this run's position (its row id).
	Before int64
	Limit  int
}

// UserRuns lists the runs a user sees of every routine (their own, and the
// shared routines' of their projects), newest first.
func (s *Store) UserRuns(ctx context.Context, userID string, f RunFilter) ([]Run, error) {
	where := []string{visibleRuns, "outcome != 'pending'"}
	args := []any{userID, userID}
	if f.Outcome != "" {
		where, args = append(where, "outcome = ?"), append(args, f.Outcome)
	}
	if f.Source != "" {
		where, args = append(where, "source = ?"), append(args, f.Source)
	}
	if f.RuleID != "" {
		where, args = append(where, "rule_id = ?"), append(args, f.RuleID)
	}
	if f.Before > 0 {
		where, args = append(where, "id < ?"), append(args, f.Before)
	}
	if f.Limit <= 0 || f.Limit > KeepRuns {
		f.Limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `SELECT `+runColumns+` FROM rule_runs WHERE `+strings.Join(where, " AND ")+` ORDER BY id DESC LIMIT ?`, append(args, f.Limit)...)
	if err != nil {
		return nil, err
	}
	return scanRuns(rows)
}

// runWrites reads what a run wrote.
func (s *Store) runWrites(ctx context.Context, runID string) ([]written, error) {
	var raw string
	if err := s.db.QueryRowContext(ctx, `SELECT batches_json FROM rule_runs WHERE run_id = ?`, runID).Scan(&raw); err != nil {
		return nil, err
	}
	var out []written
	_ = json.Unmarshal([]byte(raw), &out)
	return out, nil
}

// markUndone records a run's undo once; false when it was undone already.
func (s *Store) markUndone(ctx context.Context, runID string, at, ts int64) (bool, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE rule_runs SET undone_at = ?, undo_ts = ? WHERE run_id = ? AND undone_at IS NULL`, at, ts, runID)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// IsUndo reports whether the batch a rule wrote at ts is one of its undos
// (the history labels it "Routine (<name>) undone").
func (s *Store) IsUndo(ctx context.Context, ruleID string, ts int64) bool {
	var one int
	err := s.db.QueryRowContext(ctx, `SELECT 1 FROM rule_runs WHERE rule_id = ? AND undo_ts = ? LIMIT 1`, ruleID, ts).Scan(&one)
	return err == nil
}

// Email limits of a routine (routines-engine D6).
const (
	EmailsPerRoutine = 10
	EmailsPerAccount = 20
)

// emailCounts reads the emails a routine and its account sent on a UTC day.
func (s *Store) emailCounts(ctx context.Context, ruleID, userID, day string) (int, int, error) {
	var mine, all int
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(CASE WHEN rule_id = ? THEN sent ELSE 0 END), 0), COALESCE(SUM(sent), 0)
		FROM routine_emails WHERE user_id = ? AND day = ?`, ruleID, userID, day).Scan(&mine, &all)
	return mine, all, err
}

// TakeEmail counts one email of a routine for the UTC day, or reports the
// limit it would pass.
func (s *Store) TakeEmail(ctx context.Context, ruleID, userID, day string) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	var mine, all int
	err = tx.QueryRowContext(ctx, `SELECT sent FROM routine_emails WHERE rule_id = ? AND day = ?`, ruleID, day).Scan(&mine)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(sent), 0) FROM routine_emails WHERE user_id = ? AND day = ?`, userID, day).Scan(&all); err != nil {
		return false, err
	}
	if mine >= EmailsPerRoutine || all >= EmailsPerAccount {
		return false, nil
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO routine_emails (rule_id, user_id, day, sent) VALUES (?, ?, ?, 1)
		ON CONFLICT(rule_id, day) DO UPDATE SET sent = sent + 1`, ruleID, userID, day); err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM routine_emails WHERE day < ?`, day); err != nil {
		return false, err
	}
	return true, tx.Commit()
}

// claimedRun returns a finished run by its key (a retried manual request).
func (s *Store) runByKey(ctx context.Context, ruleID, key string) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `SELECT run_id FROM rule_runs WHERE rule_id = ? AND occurrence_key = ?`, ruleID, key).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return id, err
}
