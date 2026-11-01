package rules

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/notify"
)

// The Inbox card "Routines since your last visit" (OpenSpec change
// routines-editor, design D10-D12): which runs it lists, dismissals, the bell
// notification of a failed run and the retention that keeps a failure until
// the user saw it.

// Inbox line kinds.
const (
	InboxFailure = "failure"
	InboxSuccess = "success"
	// InboxProposal is a run whose proposal waits (routines-ai-step D2).
	InboxProposal = "proposal"
)

// MaxInboxRuns bounds one answer of the card's route; the card groups per routine.
const MaxInboxRuns = 100

// KeepSeenFailedFor is how long a failed run stays after the user's seen
// marker passed it (design D12); KeepFailedRunsFor stays the upper bound.
const KeepSeenFailedFor = 30 * 24 * time.Hour

// Outcomes the card shows as a failure or a success; other outcomes (already
// matched, skipped) changed nothing and are left out.
const (
	inboxFailed  = `'failed', 'stopped'`
	inboxDone    = `'applied', 'partial', 'ended'`
	inboxHandles = `'applied', 'already_matched', 'ended', 'partial', 'proposal'`
)

// InboxRun is one run the card lists, with its step records.
type InboxRun struct {
	Run
	Kind string `json:"kind"`
}

// SeenPrefs reads a user's seen marker and the Hide successful runs setting
// from the materialised user_prefs row (personal scope, entity id "me").
func (s *Store) SeenPrefs(ctx context.Context, userID string) (marker int64, hide bool, err error) {
	rows, err := s.db.QueryContext(ctx, `SELECT field, value FROM scope_fields WHERE scope_id = ? AND entity = 'user_prefs' AND entity_id = 'me'
		AND field IN ('routines_seen_at', 'routines_hide_successes')`, "user:"+userID)
	if err != nil {
		return 0, false, err
	}
	defer rows.Close()
	for rows.Next() {
		var field, value string
		if err := rows.Scan(&field, &value); err != nil {
			return 0, false, err
		}
		switch field {
		case "routines_seen_at":
			if f, err := strconv.ParseFloat(value, 64); err == nil && f > 0 {
				marker = int64(f)
			}
		case "routines_hide_successes":
			hide = value == `"on"`
		}
	}
	return marker, hide, rows.Err()
}

// InboxRuns lists what the card shows (design D10): the user's runs except
// tests and runs the user started by hand; failed runs until handled (undone,
// or followed by a successful run of the same routine) whatever the marker;
// successes after since, not dismissed, unless hidden. Newest first.
// routines-ai-step adds waiting proposals (any source but tests, until
// handled or expired) and AI results applied without asking, which are
// shown even when successes are hidden.
func (s *Store) InboxRuns(ctx context.Context, userID string, since int64, hideSuccesses bool) ([]InboxRun, error) {
	hide := 0
	if hideSuccesses {
		hide = 1
	}
	cols := "r." + strings.ReplaceAll(runColumns, ", ", ", r.")
	rows, err := s.db.QueryContext(ctx, `SELECT `+cols+` FROM rule_runs r
		WHERE r.user_id = ? AND r.test = 0 AND ((r.outcome = 'proposal' AND EXISTS (SELECT 1 FROM routine_proposals p
			WHERE p.run_id = r.run_id AND p.state = 'waiting' AND p.expires_at > ?)) OR (NOT (r.source = 'manual' AND r.run_as = ?) AND (
			(r.outcome IN (`+inboxFailed+`) AND r.undone_at IS NULL AND NOT EXISTS (
				SELECT 1 FROM rule_runs l WHERE l.rule_id = r.rule_id AND l.test = 0 AND l.outcome IN (`+inboxHandles+`) AND (l.at > r.at OR (l.at = r.at AND l.id > r.id))))
			OR ((? = 0 OR r.ai_auto = 1) AND r.outcome IN (`+inboxDone+`) AND r.at > ? AND r.dismissed_at IS NULL))))
		ORDER BY r.at DESC, r.id DESC LIMIT ?`, userID, s.now().UnixMilli(), userID, hide, since, MaxInboxRuns)
	if err != nil {
		return nil, err
	}
	list, err := scanRuns(rows)
	if err != nil {
		return nil, err
	}
	out := make([]InboxRun, 0, len(list))
	var proposalRuns []string
	for _, r := range list {
		if r.Outcome == OutcomeProposal {
			proposalRuns = append(proposalRuns, r.RunID)
		}
	}
	proposals, err := s.proposalsByRun(ctx, proposalRuns)
	if err != nil {
		return nil, err
	}
	for _, r := range list {
		kind := InboxSuccess
		switch r.Outcome {
		case OutcomeFailed, OutcomeStopped:
			kind = InboxFailure
		case OutcomeProposal:
			kind = InboxProposal
			if p, ok := proposals[r.RunID]; ok {
				r.Proposal = &p
			}
		}
		if r.Steps, err = s.stepRecords(ctx, r.RunID); err != nil {
			return nil, err
		}
		out = append(out, InboxRun{Run: r, Kind: kind})
	}
	return out, nil
}

// Dismiss hides one of the user's runs from the card on every device.
func (s *Store) Dismiss(ctx context.Context, userID, ruleID, runID string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE rule_runs SET dismissed_at = COALESCE(dismissed_at, ?) WHERE run_id = ? AND rule_id = ? AND user_id = ? AND outcome != 'pending'`,
		s.now().UnixMilli(), runID, ruleID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrRunNotFound
	}
	return nil
}

// markSeenFailures records when the server first found a user's seen marker
// past each failed run (design D12): retention counts its 30 days from there.
func (s *Store) markSeenFailures(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `UPDATE rule_runs SET seen_at = ? WHERE seen_at IS NULL AND outcome IN (`+inboxFailed+`)
		AND at <= COALESCE((SELECT CAST(f.value AS INTEGER) FROM scope_fields f WHERE f.scope_id = 'user:' || rule_runs.user_id
			AND f.entity = 'user_prefs' AND f.entity_id = 'me' AND f.field = 'routines_seen_at'), 0)`, s.now().UnixMilli())
	return err
}

// Dismiss hides a run from the card (POST …/runs/{run}/dismiss).
func (e *Engine) Dismiss(ctx context.Context, userID, ruleID, runID string) error {
	return e.Store.Dismiss(ctx, userID, ruleID, runID)
}

// alertFailure rings the bell for a failed run (design D11): never for a test
// or a run the user started by hand, at most one notification per routine and
// day (later failures update its count), and the routine event of channels.
func (e *Engine) alertFailure(ctx context.Context, uid string, r *rule, run Run) {
	if run.Test || (run.Source == SourceManual && run.RunAs == uid) {
		return
	}
	if run.Outcome != OutcomeFailed && run.Outcome != OutcomeStopped {
		return
	}
	sink, ok := e.Routine.(notify.RoutineAlertSink)
	if !ok {
		return
	}
	at := e.now()
	step := -1
	kind := ""
	if run.FailedStep >= 0 {
		step = run.FailedStep + 1
		for _, st := range run.Steps {
			if st.Idx == run.FailedStep {
				kind = st.Kind
			}
		}
	}
	sink.RoutineFailed(ctx, notify.RoutineAlert{UserID: uid, RuleID: r.ID, RuleName: e2ee.Display(r.Name), RunID: run.RunID,
		Step: step, StepKind: kind, Day: at.UTC().Format(time.DateOnly), At: at.UnixMilli()})
}
