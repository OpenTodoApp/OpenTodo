package rules

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/relay"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Device runs for encrypted accounts (OpenSpec change routines-ai-step,
// D7-D9): on an encrypted account a routine with a content step or an AI step
// runs on one of the user's devices opted in to run routines. The server
// records the occurrence waiting_device and sends a routine.run request with
// ids only over the device relay; the device plans on its decrypted copy and
// commits ciphertext (routine_device_commit.go). Without any opted-in device
// such a routine keeps being skipped "encrypted", as before.

// Outcomes and reasons of device runs.
const (
	OutcomeWaiting = "waiting_device"
	OutcomeMissed  = "missed"

	ReasonSuperseded     = "superseded"
	ReasonNoDevice       = "no_device"
	ReasonRoutineChanged = "routine_changed"
)

// WaitLimit is how long a run waits for a device before it is missed (D9).
const WaitLimit = 24 * time.Hour

// Devices reaches an encrypted account's devices (wired by internal/httpapi
// over internal/relay).
type Devices interface {
	// Opted reports whether the account has a device opted in to run
	// routines, and whether one announced the on-device assistant.
	Opted(ctx context.Context, uid string) (opted, ai bool, err error)
	// Online reports whether the device has an open relay stream.
	Online(uid, device string) bool
	// Send seals a routine.run request to a suitable online device.
	Send(uid string, needAI bool, prefer string, run relay.RoutineRun) (relay.Sent, error)
}

// needsDevice reports whether an encrypted account's routine runs on a device.
func (r *rule) needsDevice() bool {
	if ruleval.HasAI(r.Steps) {
		return true
	}
	types, _ := ruleval.Check(r.Steps, r.triggerType())
	return ruleval.ContentStep(r.Steps, r.triggerType(), types) != ""
}

// ruleRev is a routine's revision as a device run sees it: the fields that
// change what it plans and how it writes. A commit is refused when it moved.
func ruleRev(row opsync.Entity) string {
	h := sha256.New()
	for _, f := range []string{"trigger", "condition", "actions", "steps", "ai_apply", "ai_budget", "deleted_at"} {
		h.Write([]byte(f))
		h.Write([]byte{0})
		h.Write(row[f])
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))[:32]
}

// waitForDevice records an occurrence waiting for a device, supersedes the
// routine's older waiting runs, and sends it to a device when one is online.
// device and session bind a Run now to the device in hand (nothing is sent).
func (e *Engine) waitForDevice(ctx context.Context, uid string, r *rule, claimID int64, o runOpts, device, session string) (Result, error) {
	if err := e.Store.finishRoutine(ctx, claimID, o.runID, routineFinish{Outcome: OutcomeWaiting, FailedStep: -1}); err != nil {
		return Result{}, err
	}
	if _, err := e.db.ExecContext(ctx, `UPDATE rule_runs SET outcome = ?, reason = ? WHERE rule_id = ? AND outcome = ? AND run_id != ?`,
		OutcomeSkipped, ReasonSuperseded, r.ID, OutcomeWaiting, o.runID); err != nil {
		return Result{}, err
	}
	run, err := e.Store.RunByID(ctx, uid, o.runID)
	if err != nil {
		return Result{}, err
	}
	res := Result{Run: run, Steps: []StepPreview{}}
	req, err := e.deviceRun(ctx, uid, r, run)
	if err != nil {
		return Result{}, err
	}
	if device != "" {
		if err := e.Store.bindDevice(ctx, run.RunID, device, session, req.Rev); err != nil {
			return Result{}, err
		}
		res.DeviceRun = &req
		res.Run, err = e.Store.RunByID(ctx, uid, o.runID)
		return res, err
	}
	e.send(ctx, uid, r, req, "")
	res.Run, err = e.Store.RunByID(ctx, uid, o.runID)
	return res, err
}

// deviceRun is the routine.run request of a waiting run: ids and numbers.
func (e *Engine) deviceRun(ctx context.Context, uid string, r *rule, run Run) (relay.RoutineRun, error) {
	row, err := e.Sync.Get(ctx, uid, "rule", r.ID)
	if err != nil {
		return relay.RoutineRun{}, err
	}
	req := relay.RoutineRun{Op: relay.OpRoutineRun, RuleID: r.ID, RunID: run.RunID, Key: run.OccurrenceKey, At: run.At, TaskID: run.TaskID,
		Rev: ruleRev(row), Budget: r.AIBudget}
	if ruleval.HasAI(r.Steps) {
		mode, err := e.AIMode(ctx, uid, r.ID)
		if err != nil {
			return req, err
		}
		req.Auto = mode.Auto
		if req.Tokens, err = e.Store.aiTokens(ctx, r.ID, e.now().UTC().Format(time.DateOnly)); err != nil {
			return req, err
		}
	}
	return req, nil
}

// send hands a waiting run to a device (prefer first) and records where it went.
func (e *Engine) send(ctx context.Context, uid string, r *rule, req relay.RoutineRun, prefer string) bool {
	if e.Devices == nil {
		return false
	}
	sent, err := e.Devices.Send(uid, ruleval.HasAI(r.Steps), prefer, req)
	if err != nil {
		return false
	}
	if err := e.Store.bindDevice(ctx, req.RunID, sent.DeviceID, sent.SessionHash, req.Rev); err != nil {
		e.Log.Warn("routines: device run not bound", "rule", r.ID, "err", err)
		return false
	}
	return true
}

// bindDevice records the device a waiting run went to, its session and the
// routine's revision then.
func (s *Store) bindDevice(ctx context.Context, runID, device, session, rev string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE rule_runs SET device_id = ?, device_session = ?, device_rev = ?, dispatched_at = ? WHERE run_id = ? AND outcome = ?`,
		device, session, rev, s.now().UnixMilli(), runID, OutcomeWaiting)
	return err
}

// waitingRun is a run waiting for a device.
type waitingRun struct {
	runID, ruleID, device, session, rev string
}

// waiting lists a user's waiting runs (one per routine, D9).
func (s *Store) waiting(ctx context.Context, uid string) ([]waitingRun, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT run_id, rule_id, device_id, device_session, device_rev FROM rule_runs WHERE user_id = ? AND outcome = ? ORDER BY at, id`, uid, OutcomeWaiting)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []waitingRun
	for rows.Next() {
		var w waitingRun
		if err := rows.Scan(&w.runID, &w.ruleID, &w.device, &w.session, &w.rev); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// waitingOne reads one waiting run of the user, or sql.ErrNoRows.
func (s *Store) waitingOne(ctx context.Context, uid, runID string) (waitingRun, error) {
	var w waitingRun
	err := s.db.QueryRowContext(ctx, `SELECT run_id, rule_id, device_id, device_session, device_rev FROM rule_runs WHERE user_id = ? AND run_id = ? AND outcome = ?`,
		uid, runID, OutcomeWaiting).Scan(&w.runID, &w.ruleID, &w.device, &w.session, &w.rev)
	return w, err
}

// DispatchWaiting sends a user's waiting runs to a device whose routines
// stream just opened (D9): the runs not with another online device.
func (e *Engine) DispatchWaiting(ctx context.Context, uid, device string) {
	e.work.Lock()
	defer e.work.Unlock()
	list, err := e.Store.waiting(ctx, uid)
	if err != nil {
		e.Log.Warn("routines: waiting runs", "err", err)
		return
	}
	for _, w := range list {
		if w.device != "" && w.device != device && e.Devices != nil && e.Devices.Online(uid, w.device) {
			continue
		}
		r, err := e.findRule(ctx, uid, w.ruleID)
		if err != nil {
			// The routine is gone or unreadable: nothing can run it.
			_, _ = e.db.ExecContext(ctx, `UPDATE rule_runs SET outcome = ?, reason = ? WHERE run_id = ? AND outcome = ?`, OutcomeSkipped, ReasonRoutineChanged, w.runID, OutcomeWaiting)
			continue
		}
		run, err := e.Store.RunByID(ctx, uid, w.runID)
		if err != nil {
			continue
		}
		req, err := e.deviceRun(ctx, uid, r, run)
		if err != nil {
			continue
		}
		e.send(ctx, uid, r, req, device)
	}
}

// missWaiting records the runs that waited past WaitLimit as missed with
// reason no_device, a failure (D9), and rings the bell for them.
func (e *Engine) missWaiting(ctx context.Context) error {
	e.work.Lock()
	defer e.work.Unlock()
	cutoff := e.now().Add(-WaitLimit).UnixMilli()
	rows, err := e.db.QueryContext(ctx, `SELECT user_id, run_id, rule_id FROM rule_runs WHERE outcome = ? AND at <= ?`, OutcomeWaiting, cutoff)
	if err != nil {
		return err
	}
	type missed struct{ uid, runID, ruleID string }
	var list []missed
	for rows.Next() {
		var m missed
		if err := rows.Scan(&m.uid, &m.runID, &m.ruleID); err != nil {
			rows.Close()
			return err
		}
		list = append(list, m)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, m := range list {
		res, err := e.db.ExecContext(ctx, `UPDATE rule_runs SET outcome = ?, reason = ? WHERE run_id = ? AND outcome = ?`, OutcomeMissed, ReasonNoDevice, m.runID, OutcomeWaiting)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			continue
		}
		run, err := e.Store.RunByID(ctx, m.uid, m.runID)
		if err != nil {
			continue
		}
		r := &rule{ID: m.ruleID}
		if row, err := e.Sync.Get(ctx, m.uid, "rule", m.ruleID); err == nil && row != nil {
			r.Name = str(row, "name")
		}
		e.alertFailure(ctx, m.uid, r, run)
	}
	return nil
}

// nextMiss is when the oldest waiting run will be missed, if any waits.
func (e *Engine) nextMiss(ctx context.Context) (time.Time, bool, error) {
	var at sql.NullInt64
	if err := e.db.QueryRowContext(ctx, `SELECT MIN(at) FROM rule_runs WHERE outcome = ?`, OutcomeWaiting).Scan(&at); err != nil {
		return time.Time{}, false, err
	}
	if !at.Valid {
		return time.Time{}, false, nil
	}
	return time.UnixMilli(at.Int64).Add(WaitLimit), true, nil
}

// errNoWait is returned by deviceGate when the run is not for a device.
var errNoWait = errors.New("not a device run")

// deviceGate decides whether an encrypted account's occurrence waits for a
// device: errNoWait when it runs (or is skipped) as before.
func (e *Engine) deviceGate(ctx context.Context, uid string, r *rule, o runOpts) error {
	if o.test || o.dry || e.Devices == nil || !r.needsDevice() {
		return errNoWait
	}
	opted, _, err := e.Devices.Opted(ctx, uid)
	if err != nil {
		return err
	}
	if !opted {
		return errNoWait
	}
	return nil
}
