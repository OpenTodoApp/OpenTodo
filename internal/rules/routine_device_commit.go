package rules

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"slices"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
)

// The device run routes' engine side (routines-ai-step D8): a device commits
// the result of a routine run it was sent (or started with Run now) as
// ciphertext operations or one ciphertext proposal envelope, or reports that
// it failed. The server checks the run is waiting on that device's session,
// that the routine did not change, the limits and auto mode's allowed writes,
// and then writes with device rule:<rule-id> like a server run.

// Device run refusals.
var (
	ErrNotYourRun     = errors.New("this run was sent to another device")
	ErrRunClosed      = errors.New("this run is not waiting for a device")
	ErrRoutineChanged = errors.New("the routine changed since this run was sent: nothing was written")
	ErrFallback       = errors.New("apply without asking does not allow this result: commit it as a proposal")
	ErrDeviceWrites   = errors.New("the run would write more than 500 items")
	ErrPlaintext      = errors.New("an encrypted account's content must be sent encrypted")
	ErrBadCommit      = errors.New("invalid commit")
)

// MaxEnvelope bounds a proposal envelope (a proposal holds at most 500 items).
const MaxEnvelope = 2 << 20

// DeviceChange is one entity a device run writes: its fields, content as
// ciphertext.
type DeviceChange struct {
	Entity string                     `json:"entity"`
	ID     string                     `json:"id"`
	Create bool                       `json:"create,omitempty"`
	Fields map[string]json.RawMessage `json:"fields"`
}

// DeviceSide is a side effect of a device run: a Notify me (text as
// ciphertext; channels receive it without text) or a Send a webhook without
// text (D7: a webhook with text is unavailable on an encrypted account).
type DeviceSide struct {
	Kind    string   `json:"kind"` // notify | webhook
	StepID  string   `json:"step"`
	Text    string   `json:"text,omitempty"`
	TaskID  string   `json:"task,omitempty"`
	Webhook string   `json:"webhook,omitempty"`
	Tasks   []string `json:"tasks,omitempty"`
}

// DeviceProposal is a proposal run's result: one ciphertext envelope.
type DeviceProposal struct {
	Envelope string `json:"envelope"`
	Items    int    `json:"items"`
}

// DeviceCommit is the body of POST /api/v1/me/rules/runs/{run}/commit.
type DeviceCommit struct {
	Steps      []StepRecord    `json:"steps"`
	Outcome    string          `json:"outcome"` // applied | already_matched | ended
	DurationMs int64           `json:"duration_ms"`
	Tokens     int64           `json:"tokens"`
	Changes    []DeviceChange  `json:"changes"`
	Completing []string        `json:"completing"`
	Sides      []DeviceSide    `json:"sides"`
	Proposal   *DeviceProposal `json:"proposal"`
}

// DeviceFail is the body of POST /api/v1/me/rules/runs/{run}/fail.
type DeviceFail struct {
	Step       int          `json:"step"` // the failed step's index, -1 for none
	Code       string       `json:"code"`
	Steps      []StepRecord `json:"steps"`
	DurationMs int64        `json:"duration_ms"`
	Tokens     int64        `json:"tokens"`
}

var codeRe = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

// cleanSteps keeps a device's step records to ids, counts and codes.
func cleanSteps(list []StepRecord, max int) ([]StepRecord, int64, error) {
	if len(list) > max {
		return nil, 0, ErrBadCommit
	}
	var tokens int64
	out := make([]StepRecord, 0, len(list))
	for i, s := range list {
		if s.Error != "" && !codeRe.MatchString(s.Error) {
			return nil, 0, ErrBadCommit
		}
		switch s.Status {
		case StepOK, StepSkipped, StepEnded, StepFailed, StepUnavailable, StepTruncated:
		default:
			return nil, 0, ErrBadCommit
		}
		if _, ok := ruleval.StepKindOf(s.Kind); !ok && s.Kind != "if" && s.Kind != "repeat" {
			return nil, 0, ErrBadCommit
		}
		if s.Tokens < 0 || s.Items < 0 || s.DurationMs < 0 || len(s.StepID) > 64 {
			return nil, 0, ErrBadCommit
		}
		for _, id := range s.IDs {
			if len(id) > 128 {
				return nil, 0, ErrBadCommit
			}
		}
		s.Idx = i
		tokens += s.Tokens
		out = append(out, s)
	}
	return out, tokens, nil
}

// devicePass is the checks every device route shares: the run waits on this
// session's device and the routine is the one it was sent.
func (e *Engine) devicePass(ctx context.Context, uid, runID, session string) (*rule, Run, error) {
	w, err := e.Store.waitingOne(ctx, uid, runID)
	if errors.Is(err, sql.ErrNoRows) {
		if _, err := e.Store.RunByID(ctx, uid, runID); err != nil {
			return nil, Run{}, err
		}
		return nil, Run{}, ErrRunClosed
	}
	if err != nil {
		return nil, Run{}, err
	}
	if w.session == "" || w.session != session {
		return nil, Run{}, ErrNotYourRun
	}
	run, err := e.Store.RunByID(ctx, uid, runID)
	if err != nil {
		return nil, Run{}, err
	}
	row, err := e.Sync.Get(ctx, uid, "rule", w.ruleID)
	if err != nil {
		return nil, run, err
	}
	r, rerr := e.findRule(ctx, uid, w.ruleID)
	if row == nil || rerr != nil || ruleRev(row) != w.rev {
		if r == nil {
			r = &rule{ID: w.ruleID}
		}
		if err := e.finishDevice(ctx, uid, r, run, routineFinish{Outcome: OutcomeFailed, Reason: ReasonRoutineChanged, FailedStep: -1}); err != nil {
			return nil, run, err
		}
		return nil, run, ErrRoutineChanged
	}
	return r, run, nil
}

// finishDevice records a device run's end once (the run must still wait)
// and rings what a server run rings.
func (e *Engine) finishDevice(ctx context.Context, uid string, r *rule, run Run, f routineFinish) error {
	res, err := e.db.ExecContext(ctx, `UPDATE rule_runs SET outcome = ? WHERE id = ? AND outcome = ?`, OutcomePending, run.ID, OutcomeWaiting)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrRunClosed
	}
	if err := e.Store.finishRoutine(ctx, run.ID, run.RunID, f); err != nil {
		return err
	}
	if f.Tokens > 0 {
		if err := e.Store.addAITokens(ctx, r.ID, uid, e.now().UTC().Format(time.DateOnly), f.Tokens); err != nil {
			e.Log.Warn("routines: device tokens not counted", "rule", r.ID, "err", err)
		}
	}
	done, err := e.Store.RunByID(ctx, uid, run.RunID)
	if err != nil {
		return err
	}
	e.alertFailure(ctx, uid, r, done)
	e.afterAIRun(ctx, uid, r, done)
	return nil
}

// FailDeviceRun records a device run that could not finish.
func (e *Engine) FailDeviceRun(ctx context.Context, uid, runID, session string, f DeviceFail) (Run, error) {
	e.work.Lock()
	defer e.work.Unlock()
	if !codeRe.MatchString(f.Code) || f.DurationMs < 0 {
		return Run{}, ErrBadCommit
	}
	r, run, err := e.devicePass(ctx, uid, runID, session)
	if err != nil {
		return run, err
	}
	steps, tokens, err := cleanSteps(f.Steps, ruleval.MaxSteps*ruleval.MaxIterations)
	if err != nil {
		return run, err
	}
	if f.Step < -1 || f.Step >= len(steps) {
		f.Step = -1
	}
	if f.Tokens > tokens {
		tokens = f.Tokens
	}
	err = e.finishDevice(ctx, uid, r, run, routineFinish{Outcome: OutcomeFailed, Reason: f.Code, FailedStep: f.Step, Steps: steps, DurationMs: f.DurationMs, Tokens: tokens})
	if err != nil {
		return run, err
	}
	return e.Store.RunByID(ctx, uid, runID)
}

// CommitDeviceRun writes a device run's result (D8).
func (e *Engine) CommitDeviceRun(ctx context.Context, uid, runID, session string, c DeviceCommit) (Result, error) {
	e.work.Lock()
	defer e.work.Unlock()
	r, run, err := e.devicePass(ctx, uid, runID, session)
	if err != nil {
		return Result{Run: run}, err
	}
	steps, tokens, err := cleanSteps(c.Steps, ruleval.MaxSteps*ruleval.MaxIterations)
	if err != nil || c.DurationMs < 0 {
		return Result{}, ErrBadCommit
	}
	if c.Tokens > tokens {
		tokens = c.Tokens
	}
	f := routineFinish{Outcome: OutcomeApplied, FailedStep: -1, Steps: steps, DurationMs: c.DurationMs, Tokens: tokens}
	if c.Proposal != nil {
		return e.commitProposal(ctx, uid, r, run, c, f)
	}
	w, err := e.load(ctx, uid)
	if err != nil {
		return Result{}, err
	}
	st := e.newRun(ctx, w, r, run.OccurrenceKey, run.RunID, false)
	if err := st.layDevice(c); err != nil {
		return Result{}, err
	}
	if st.writesPlanned() > MaxWrites {
		return Result{}, ErrDeviceWrites
	}
	if ruleval.HasAI(r.Steps) {
		mode, err := e.AIMode(ctx, uid, r.ID)
		if err != nil {
			return Result{}, err
		}
		if !mode.Auto {
			return Result{}, ErrFallback
		}
		if reason := st.autoCheck(); reason != "" {
			if err := e.Store.setFallback(ctx, uid, r.ID, reason); err != nil {
				return Result{}, err
			}
			return Result{}, ErrFallback
		}
		f.AIAuto = true
	}
	switch c.Outcome {
	case OutcomeEnded, OutcomeAlreadyMatched:
		f.Outcome = c.Outcome
	}
	if len(st.overlay) == 0 && len(st.sides) == 0 {
		if f.Outcome == OutcomeApplied {
			f.Outcome = OutcomeAlreadyMatched
		}
		f.AIAuto = false
		return e.deviceDone(ctx, uid, r, run, f)
	}
	// The run still waits (devicePass, under e.work, which every pass that
	// closes waiting runs holds too), so this commit is its only finish.
	wrote, n, refused, err := st.commit(run.Depth)
	f.Written, f.Writes = wrote, n
	if err != nil {
		f.Outcome, f.Reason = OutcomeFailed, err.Error()
	} else if refused > 0 {
		f.Outcome, f.Reason = OutcomePartial, refusedReason(refused)
	}
	e.limits.take(uid, e.now())
	return e.deviceDone(ctx, uid, r, run, f)
}

func (e *Engine) deviceDone(ctx context.Context, uid string, r *rule, run Run, f routineFinish) (Result, error) {
	if err := e.finishDevice(ctx, uid, r, run, f); err != nil {
		return Result{}, err
	}
	done, err := e.Store.RunByID(ctx, uid, run.RunID)
	return Result{Run: done, Steps: []StepPreview{}, Writes: done.Writes}, err
}

// commitProposal stores an encrypted account's proposal as written by the device.
func (e *Engine) commitProposal(ctx context.Context, uid string, r *rule, run Run, c DeviceCommit, f routineFinish) (Result, error) {
	p := c.Proposal
	if !e2ee.IsEnvelope(p.Envelope) || len(p.Envelope) > MaxEnvelope || p.Items < 1 || p.Items > MaxProposalItems || len(c.Changes) > 0 || len(c.Sides) > 0 {
		return Result{}, ErrBadCommit
	}
	now := e.now()
	if _, err := e.db.ExecContext(ctx, `INSERT INTO routine_proposals (id, rule_id, run_id, user_id, created_at, expires_at, state, items, encrypted, body)
		VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?, 1, ?) ON CONFLICT (run_id) DO NOTHING`, ids.New(), r.ID, run.RunID, uid, now.UnixMilli(), now.Add(ProposalLife).UnixMilli(), p.Items, p.Envelope); err != nil {
		return Result{}, err
	}
	f.Outcome = OutcomeProposal
	res, err := e.deviceDone(ctx, uid, r, run, f)
	if err != nil {
		return res, err
	}
	e.alertProposal(ctx, uid, r, res.Run, p.Items)
	return res, nil
}

// deviceEntities are the entities a routine step may write.
var deviceEntities = map[string]bool{"task": true, "project": true, "section": true, "label": true, "comment": true, "time_entry": true, "review": true}

// layDevice lays a device's changes and side effects over the run as if it
// had planned them, refusing plaintext content and what the routine's steps
// cannot do.
func (st *runState) layDevice(c DeviceCommit) error {
	seen := map[string]bool{}
	for _, ch := range c.Changes {
		if !deviceEntities[ch.Entity] || ch.ID == "" || len(ch.ID) > 128 || len(ch.Fields) == 0 || seen[ch.Entity+"\x00"+ch.ID] {
			return ErrBadCommit
		}
		seen[ch.Entity+"\x00"+ch.ID] = true
		for f, v := range ch.Fields {
			if e2ee.IsContentField(ch.Entity, f) && !sealedOrEmpty(v) {
				return ErrPlaintext
			}
		}
		st.overlay = append(st.overlay, agenttools.Change{Entity: ch.Entity, EntityID: ch.ID, Create: ch.Create, Patch: ch.Fields})
	}
	for _, id := range c.Completing {
		if !seen["task\x00"+id] {
			return ErrBadCommit
		}
		st.completing[id] = true
	}
	hooks, notifies := map[string]bool{}, map[string]bool{}
	ruleval.Walk(st.r.Steps, func(s *ruleval.Step) {
		switch s.Kind {
		case "webhook":
			var id string
			_ = json.Unmarshal(s.In["webhook_id"].Lit, &id)
			if _, text := s.In["text"]; !text {
				hooks[id] = true
			}
		case "notify":
			notifies[s.ID] = true
		}
	})
	if len(c.Sides) > ruleval.MaxIterations {
		return ErrBadCommit
	}
	for _, sd := range c.Sides {
		switch {
		case sd.Kind == "notify" && notifies[sd.StepID] && (sd.Text == "" || e2ee.IsEnvelope(sd.Text)) && len(sd.Text) <= 64*1024:
			n := notify.RoutineNotice{UserID: st.w.uid, RuleID: st.r.ID, RuleName: st.ruleName(), RunID: st.runID, StepID: sd.StepID, Text: sd.Text, TaskID: sd.TaskID, At: st.nowMs}
			st.sides = append(st.sides, st.side(sideSpec{Kind: "notify", Notice: &n}))
		case sd.Kind == "webhook" && hooks[sd.Webhook] && sd.Text == "" && len(sd.Tasks) <= ruleval.MaxListItems:
			d := RoutineDelivery{RuleID: st.r.ID, RuleName: st.ruleName(), RunID: st.runID, StepID: sd.StepID, TaskIDs: slices.Clone(sd.Tasks)}
			st.sides = append(st.sides, st.side(sideSpec{Kind: "webhook", Hook: sd.Webhook, Delivery: &d}))
		default:
			return ErrBadCommit
		}
	}
	return nil
}

// sealedOrEmpty reports a content value a device may send: null, "" or an envelope.
func sealedOrEmpty(v json.RawMessage) bool {
	if string(v) == "null" {
		return true
	}
	var s string
	if json.Unmarshal(v, &s) != nil {
		return false
	}
	return s == "" || e2ee.IsEnvelope(s)
}

// EncryptedApply is an encrypted account's proposal as a device applies it
// (D3): the ticked items it decrypted and re-checked, as ciphertext changes.
type EncryptedApply struct {
	Changes    []DeviceChange `json:"changes"`
	Completing []string       `json:"completing"`
	Sides      []DeviceSide   `json:"sides"`
	// Skipped items were unticked or found deleted or changed on the device;
	// Changed of them changed since the proposal.
	Skipped int `json:"skipped"`
	Changed int `json:"changed"`
}

// ApplyEncryptedProposal writes an encrypted proposal's ticked items as the
// device sends them, with the commit route's checks, recorded on the run so
// Undo run works; any device of the account may apply it.
func (e *Engine) ApplyEncryptedProposal(ctx context.Context, uid, id string, a EncryptedApply) (ApplyResult, error) {
	e.work.Lock()
	defer e.work.Unlock()
	var out ApplyResult
	p, _, err := e.Store.proposal(ctx, uid, id)
	if err != nil {
		return out, err
	}
	out.RunID, out.RuleID = p.RunID, p.RuleID
	if p.State != ProposalWaiting {
		return out, ErrProposalClosed
	}
	if !p.Encrypted {
		return out, ErrBadCommit
	}
	if a.Skipped < 0 || a.Changed < 0 || a.Changed > a.Skipped || len(a.Changes)+len(a.Sides)+a.Skipped > p.Items {
		return out, ErrBadCommit
	}
	if len(a.Changes) == 0 && len(a.Sides) == 0 {
		return out, ErrNoItems
	}
	r, err := e.findRule(ctx, uid, p.RuleID)
	if err != nil {
		return out, ErrProposalClosed
	}
	run, err := e.Store.RunByID(ctx, uid, p.RunID)
	if err != nil {
		return out, err
	}
	w, err := e.load(ctx, uid)
	if err != nil {
		return out, err
	}
	st := e.newRun(ctx, w, r, run.OccurrenceKey, run.RunID, false)
	if err := st.layDevice(DeviceCommit{Changes: a.Changes, Completing: a.Completing, Sides: a.Sides}); err != nil {
		return out, err
	}
	wrote, n, refused, err := st.commit(run.Depth)
	if err != nil {
		return out, err
	}
	out.Refused, out.Skipped, out.Changed = refused, a.Skipped, a.Changed
	out.Applied = len(a.Changes) + len(a.Sides) - refused
	if err := e.Store.recordApplied(ctx, run.RunID, wrote, n); err != nil {
		return out, err
	}
	out.State = ProposalApplied
	if out.Applied < p.Items {
		out.State = ProposalPartly
	}
	return out, e.Store.closeProposal(ctx, p.ID, out.State, out.Applied, out.Skipped+refused)
}
