package rules

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Proposals (OpenSpec change routines-ai-step, design D2 and D3): a run of a
// routine with an AI step that is not in effective auto mode plans every step
// and writes nothing; its planned changes and side effects wait as a proposal
// until the person applies (some of) them, dismisses it, or it expires after
// 7 days. Its body is content (titles the AI wrote): it is kept only while
// waiting and never copied into the run log or exports.

// OutcomeProposal is a run whose changes wait as a proposal.
const OutcomeProposal = "proposal"

// Proposal states.
const (
	ProposalWaiting   = "waiting"
	ProposalApplied   = "applied"
	ProposalPartly    = "partly_applied"
	ProposalDismissed = "dismissed"
	ProposalExpired   = "expired"
)

// ProposalLife is how long a proposal waits (D2).
const ProposalLife = 7 * 24 * time.Hour

// MaxProposalItems bounds one proposal (a run writes at most 500 items).
const MaxProposalItems = MaxWrites

// Proposal errors.
var (
	ErrProposalNotFound  = errors.New("proposal not found")
	ErrProposalClosed    = errors.New("this proposal was already applied, dismissed or expired")
	ErrProposalEncrypted = errors.New("this proposal is encrypted: review and apply it in the app")
	ErrNoItems           = errors.New("items: give at least one item key")
)

// ProposalItem is one reviewable item: a created or changed entity with its
// new values and the values it was planned on, or a side effect.
type ProposalItem struct {
	Key    string                     `json:"key"`
	Kind   string                     `json:"kind"` // create | change | notify | webhook | email
	Entity string                     `json:"entity,omitempty"`
	ID     string                     `json:"id,omitempty"`
	Fields map[string]json.RawMessage `json:"fields,omitempty"`
	Before map[string]json.RawMessage `json:"before,omitempty"`
	// AI marks an item whose text the AI wrote ("Written by AI").
	AI   bool      `json:"ai"`
	Side *sideSpec `json:"side,omitempty"`
}

// proposalBody is what a plaintext proposal stores.
type proposalBody struct {
	Items      []ProposalItem       `json:"items"`
	Changes    agenttools.ChangeSet `json:"changes"`
	Completing []string             `json:"completing"`
}

// Proposal is one proposal as the routes show it; List only for one proposal.
type Proposal struct {
	ID        string         `json:"id"`
	RuleID    string         `json:"rule_id"`
	RunID     string         `json:"run_id"`
	CreatedAt int64          `json:"created_at"`
	ExpiresAt int64          `json:"expires_at"`
	State     string         `json:"state"`
	Items     int            `json:"items"`
	Applied   int            `json:"applied"`
	Skipped   int            `json:"skipped"`
	Encrypted bool           `json:"encrypted"`
	List      []ProposalItem `json:"list,omitempty"`
	// Envelope is an encrypted account's body (one ciphertext envelope).
	Envelope string `json:"envelope,omitempty"`
}

// textFields are the fields whose value may hold AI text.
var textFields = []string{"title", "description", "body", "name", "content", "text"}

// proposalItems describes the plan for review: one item per created or
// changed entity in plan order, then one per side effect.
func (st *runState) proposalItems() []ProposalItem {
	var out []ProposalItem
	for _, m := range mergeChanges(st.overlay) {
		it := ProposalItem{Key: "e:" + m.entity + ":" + m.id, Kind: "change", Entity: m.entity, ID: m.id, Fields: m.patch}
		if m.create {
			it.Kind = "create"
		} else {
			it.Before = map[string]json.RawMessage{}
			base := st.baseRow(m.entity, m.id)
			for f := range m.patch {
				v, ok := base[f]
				if !ok {
					v = nullJSON
					if def, ok := opsync.Schema[m.entity][f]; ok && def.Default != "" {
						v = json.RawMessage(def.Default)
					}
				}
				it.Before[f] = v
			}
		}
		it.AI = st.aiWrote(m.patch)
		out = append(out, it)
	}
	for i, s := range st.sides {
		sp := s.spec
		it := ProposalItem{Key: "s:" + strconv.Itoa(i), Kind: sp.Kind, Side: &sp}
		if sp.Kind == "fired" {
			it.Kind = "notify"
		}
		switch {
		case sp.Notice != nil:
			it.AI = st.aiIn(sp.Notice.Text)
		case sp.Mail != nil:
			it.AI = st.aiIn(sp.Mail.Subject) || st.aiIn(sp.Mail.Text)
		case sp.Delivery != nil && sp.Delivery.Text != nil:
			it.AI = st.aiIn(*sp.Delivery.Text)
		}
		out = append(out, it)
	}
	return out
}

// baseRow is an entity's row before the run's plan.
func (st *runState) baseRow(entity, id string) opsync.Entity {
	switch entity {
	case "task":
		return st.w.tasks[id]
	case "project":
		return st.w.projectRows[id]
	}
	row, _ := st.e.Sync.Get(st.ctx, st.w.uid, entity, id)
	return row
}

// aiWrote reports whether a patch carries text an AI step answered.
func (st *runState) aiWrote(patch map[string]json.RawMessage) bool {
	for _, f := range textFields {
		var s string
		if json.Unmarshal(patch[f], &s) == nil && st.aiIn(s) {
			return true
		}
	}
	return false
}

// aiIn reports whether text contains an AI answer (or a line of one).
func (st *runState) aiIn(text string) bool {
	if text == "" {
		return false
	}
	for _, a := range st.aiTexts {
		if a = strings.TrimSpace(a); a != "" && (strings.Contains(text, a) || strings.Contains(a, text)) {
			return true
		}
	}
	return false
}

// propose stores the plan as a proposal and returns its item count.
func (st *runState) propose() (int, error) {
	items := st.proposalItems()
	if len(items) > MaxProposalItems {
		items = items[:MaxProposalItems]
	}
	completing := []string{}
	for id := range st.completing {
		completing = append(completing, id)
	}
	slices.Sort(completing)
	body, err := json.Marshal(proposalBody{Items: items, Changes: st.overlay, Completing: completing})
	if err != nil {
		return 0, err
	}
	now := st.e.now()
	_, err = st.e.db.ExecContext(st.ctx, `INSERT INTO routine_proposals (id, rule_id, run_id, user_id, created_at, expires_at, state, items, body)
		VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?, ?)`, ids.New(), st.r.ID, st.runID, st.w.uid, now.UnixMilli(), now.Add(ProposalLife).UnixMilli(), len(items), string(body))
	return len(items), err
}

const proposalColumns = `id, rule_id, run_id, created_at, expires_at, state, items, applied, skipped, encrypted`

func scanProposal(sc interface{ Scan(...any) error }) (Proposal, error) {
	var p Proposal
	err := sc.Scan(&p.ID, &p.RuleID, &p.RunID, &p.CreatedAt, &p.ExpiresAt, &p.State, &p.Items, &p.Applied, &p.Skipped, &p.Encrypted)
	return p, err
}

// Proposals lists a user's waiting proposals, newest first.
func (s *Store) Proposals(ctx context.Context, uid string) ([]Proposal, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+proposalColumns+` FROM routine_proposals WHERE user_id = ? AND state = 'waiting' AND expires_at > ?
		ORDER BY created_at DESC LIMIT 100`, uid, s.now().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Proposal{}
	for rows.Next() {
		p, err := scanProposal(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// proposal reads one of a user's proposals with its body.
func (s *Store) proposal(ctx context.Context, uid, id string) (Proposal, string, error) {
	var body sql.NullString
	row := s.db.QueryRowContext(ctx, `SELECT `+proposalColumns+`, body FROM routine_proposals WHERE id = ? AND user_id = ?`, id, uid)
	var p Proposal
	err := row.Scan(&p.ID, &p.RuleID, &p.RunID, &p.CreatedAt, &p.ExpiresAt, &p.State, &p.Items, &p.Applied, &p.Skipped, &p.Encrypted, &body)
	if errors.Is(err, sql.ErrNoRows) {
		return p, "", ErrProposalNotFound
	}
	if err == nil && p.State == ProposalWaiting && p.ExpiresAt <= s.now().UnixMilli() {
		p.State = ProposalExpired
	}
	return p, body.String, err
}

// proposalsByRun reads the proposal of each run that has one.
func (s *Store) proposalsByRun(ctx context.Context, runIDs []string) (map[string]Proposal, error) {
	out := map[string]Proposal{}
	if len(runIDs) == 0 {
		return out, nil
	}
	args := make([]any, len(runIDs))
	for i, id := range runIDs {
		args[i] = id
	}
	rows, err := s.db.QueryContext(ctx, `SELECT `+proposalColumns+` FROM routine_proposals WHERE run_id IN (?`+strings.Repeat(", ?", len(runIDs)-1)+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	now := s.now().UnixMilli()
	for rows.Next() {
		p, err := scanProposal(rows)
		if err != nil {
			return nil, err
		}
		if p.State == ProposalWaiting && p.ExpiresAt <= now {
			p.State = ProposalExpired
		}
		out[p.RunID] = p
	}
	return out, rows.Err()
}

// GetProposal returns one of a user's proposals with its items (or, for an
// encrypted account, its envelope); a closed proposal has neither.
func (e *Engine) GetProposal(ctx context.Context, uid, id string) (Proposal, error) {
	p, body, err := e.Store.proposal(ctx, uid, id)
	if err != nil || p.State != ProposalWaiting || body == "" {
		return p, err
	}
	if p.Encrypted {
		p.Envelope = body
		return p, nil
	}
	var b proposalBody
	if err := json.Unmarshal([]byte(body), &b); err != nil {
		return p, err
	}
	p.List = b.Items
	return p, nil
}

// DismissProposal discards a waiting proposal and its body.
func (e *Engine) DismissProposal(ctx context.Context, uid, id string) error {
	p, _, err := e.Store.proposal(ctx, uid, id)
	if err != nil {
		return err
	}
	if p.State != ProposalWaiting {
		return ErrProposalClosed
	}
	return e.Store.closeProposal(ctx, id, ProposalDismissed, 0, 0)
}

func (s *Store) closeProposal(ctx context.Context, id, state string, applied, skipped int) error {
	res, err := s.db.ExecContext(ctx, `UPDATE routine_proposals SET state = ?, applied = ?, skipped = ?, body = NULL, handled_at = ? WHERE id = ? AND state = 'waiting'`,
		state, applied, skipped, s.now().UnixMilli(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrProposalClosed
	}
	return nil
}

// expireProposals closes the proposals past their 7 days and drops their
// bodies; handled proposals go with their run's retention.
func (s *Store) expireProposals(ctx context.Context) error {
	now := s.now().UnixMilli()
	if _, err := s.db.ExecContext(ctx, `UPDATE routine_proposals SET state = 'expired', body = NULL, handled_at = ? WHERE state = 'waiting' AND expires_at <= ?`, now, now); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM routine_proposals WHERE state != 'waiting' AND run_id NOT IN (SELECT run_id FROM rule_runs)`)
	return err
}

// ApplyResult is what applying a proposal did.
type ApplyResult struct {
	State   string `json:"state"`
	Applied int    `json:"applied"`
	// Skipped counts the items whose target was deleted or whose field changed
	// since the proposal (Changed of them changed); Refused were refused when writing.
	Skipped int    `json:"skipped"`
	Changed int    `json:"changed"`
	Refused int    `json:"refused"`
	RunID   string `json:"run_id"`
	RuleID  string `json:"rule_id"`
}

// ApplyProposal writes the given items of a plaintext proposal (all when keys
// is nil): each re-checked against the current rows (an item whose target was
// deleted or whose planned-on field changed is skipped and counted), written
// with device rule:<rule-id> and recorded on the run so Undo run works.
func (e *Engine) ApplyProposal(ctx context.Context, uid, id string, keys []string) (ApplyResult, error) {
	e.work.Lock()
	defer e.work.Unlock()
	var out ApplyResult
	p, body, err := e.Store.proposal(ctx, uid, id)
	if err != nil {
		return out, err
	}
	out.RunID, out.RuleID = p.RunID, p.RuleID
	if p.State != ProposalWaiting || body == "" {
		return out, ErrProposalClosed
	}
	if p.Encrypted {
		return out, ErrProposalEncrypted
	}
	if keys != nil && len(keys) == 0 {
		return out, ErrNoItems
	}
	var b proposalBody
	if err := json.Unmarshal([]byte(body), &b); err != nil {
		return out, err
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
	keep := map[string]bool{}
	var sides []sideSpec
	for _, it := range b.Items {
		if keys != nil && !slices.Contains(keys, it.Key) {
			continue
		}
		if it.Side != nil {
			sides = append(sides, *it.Side)
			continue
		}
		if why := st.stale(it); why != "" {
			out.Skipped++
			if why == "changed" {
				out.Changed++
			}
			continue
		}
		keep[it.Entity+"\x00"+it.ID] = true
	}
	for _, c := range b.Changes {
		if keep[c.Entity+"\x00"+c.EntityID] {
			st.overlay = append(st.overlay, c)
		}
	}
	for _, id := range b.Completing {
		if keep["task\x00"+id] {
			st.completing[id] = true
		}
	}
	for _, sp := range sides {
		st.sides = append(st.sides, st.side(sp))
	}
	wrote, n, refused, err := st.commit(run.Depth)
	if err != nil {
		return out, err
	}
	out.Refused = refused
	out.Applied = len(keep) + len(sides) - refused
	if err := e.Store.recordApplied(ctx, run.RunID, wrote, n); err != nil {
		return out, err
	}
	out.State = ProposalApplied
	if out.Applied < p.Items {
		out.State = ProposalPartly
	}
	if err := e.Store.closeProposal(ctx, p.ID, out.State, out.Applied, out.Skipped+refused); err != nil {
		return out, err
	}
	return out, nil
}

// stale reports why an item can no longer be applied: "deleted" when its
// target is gone, "changed" when a field it was planned on changed since.
func (st *runState) stale(it ProposalItem) string {
	if it.Kind == "create" {
		return ""
	}
	cur := st.baseRow(it.Entity, it.ID)
	if cur == nil || !opsync.IsNull(cur["deleted_at"]) {
		return "deleted"
	}
	for f, before := range it.Before {
		now, ok := cur[f]
		if !ok {
			now = nullJSON
			if def, ok := opsync.Schema[it.Entity][f]; ok && def.Default != "" {
				now = json.RawMessage(def.Default)
			}
		}
		if !sameJSON(before, now) {
			return "changed"
		}
	}
	return ""
}

// recordApplied adds what an applied proposal wrote to its run, for Undo.
func (s *Store) recordApplied(ctx context.Context, runID string, wrote []written, n int) error {
	if wrote == nil {
		wrote = []written{}
	}
	b, _ := json.Marshal(wrote)
	_, err := s.db.ExecContext(ctx, `UPDATE rule_runs SET batches_json = ?, writes = ? WHERE run_id = ?`, string(b), n, runID)
	return err
}

// alertProposal rings the bell for a proposal left waiting (D2): never for a
// test or a run the person started by hand (they see it there).
func (e *Engine) alertProposal(ctx context.Context, uid string, r *rule, run Run, items int) {
	if run.Test || (run.Source == SourceManual && run.RunAs == uid) {
		return
	}
	sink, ok := e.Routine.(notify.RoutineProposalSink)
	if !ok {
		return
	}
	at := e.now()
	sink.RoutineProposal(ctx, notify.RoutineAlert{UserID: uid, RuleID: r.ID, RuleName: e2ee.Display(r.Name), RunID: run.RunID,
		Step: -1, Day: at.UTC().Format(time.DateOnly), Count: items, At: at.UnixMilli()})
}
