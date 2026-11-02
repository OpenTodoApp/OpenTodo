package rules

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"sort"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Undo a whole run (routines-engine D12): every field the run wrote whose
// current winning op is still the run's goes back to the value before it;
// entities it created are moved to the Trash unless changed since; a timer it
// started is stopped. Notifications, deliveries and emails are not undone.

// ErrAlreadyUndone is the answer for a run undone before.
var ErrAlreadyUndone = errors.New("this run was undone already")

// UndoResult says what an undo did.
type UndoResult struct {
	Restored    int      `json:"restored"`
	Kept        int      `json:"kept"`
	NotUndoable []string `json:"not_undoable"`
}

type undoKey struct{}

// withUndo marks an undo's write: the observer derives no rule events from it.
func withUndo(ctx context.Context) context.Context { return context.WithValue(ctx, undoKey{}, true) }

func isUndo(ctx context.Context) bool { v, _ := ctx.Value(undoKey{}).(bool); return v }

type fieldOp struct {
	opID   string
	value  json.RawMessage
	ts     int64
	device string
}

// fieldOps reads every op of one field, in arrival order.
func (e *Engine) fieldOps(ctx context.Context, entity, id, field string) ([]fieldOp, error) {
	rows, err := e.db.QueryContext(ctx, `SELECT op_id, value, ts, device FROM ops WHERE entity = ? AND entity_id = ? AND field = ? ORDER BY seq`, entity, id, field)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []fieldOp
	for rows.Next() {
		var o fieldOp
		var v string
		if err := rows.Scan(&o.opID, &v, &o.ts, &o.device); err != nil {
			return nil, err
		}
		o.value = json.RawMessage(v)
		out = append(out, o)
	}
	return out, rows.Err()
}

// winner is the op last-writer-wins keeps among list, or nil.
func winner(list []fieldOp, skip string) *fieldOp {
	var best *fieldOp
	for i := range list {
		o := &list[i]
		if o.opID == skip {
			continue
		}
		if best == nil || opsync.Wins(o.ts, o.device, best.ts, best.device) {
			best = o
		}
	}
	return best
}

// legacyWrites reads a rule run's changes_json as what it wrote.
func legacyWrites(changes json.RawMessage) []written {
	var list []change
	_ = json.Unmarshal(changes, &list)
	var out []written
	for _, c := range list {
		out = append(out, written{Entity: "task", ID: c.TaskID, Fields: fieldsOf(c.Fields)})
	}
	return out
}

// Undo takes a run back once (POST /api/v1/rules/{id}/runs/{run}/undo).
func (e *Engine) Undo(ctx context.Context, uid, ruleID, runID string) (UndoResult, error) {
	e.work.Lock()
	defer e.work.Unlock()
	out := UndoResult{NotUndoable: []string{}}
	run, err := e.Store.RunByID(ctx, uid, runID)
	if err != nil || run.RuleID != ruleID {
		return out, ErrRunNotFound
	}
	if run.ProjectID != "" {
		// A shared routine's run is undone by an editor or above, as them
		// (routines-shared D7).
		if role, _, err := e.projectRole(ctx, run.ProjectID, uid); err != nil {
			return out, err
		} else if !canEdit(role) {
			return out, ErrForbidden
		}
	}
	if run.UndoneAt != nil {
		return out, ErrAlreadyUndone
	}
	list, err := e.Store.runWrites(ctx, runID)
	if err != nil {
		return out, err
	}
	if len(list) == 0 {
		list = legacyWrites(run.Changes)
	}
	for _, s := range run.Steps {
		if s.Status != StepOK {
			continue
		}
		switch s.Kind {
		case "notify":
			out.NotUndoable = appendOnce(out.NotUndoable, "notifications")
		case "webhook":
			out.NotUndoable = appendOnce(out.NotUndoable, "webhook deliveries")
		case "email_me", "email_members":
			out.NotUndoable = appendOnce(out.NotUndoable, "emails")
		}
	}
	nowMs := e.now().UnixMilli()
	ts := e.Sync.ServerTSAt(nowMs)
	if ok, err := e.Store.markUndone(ctx, runID, nowMs, ts); err != nil {
		return out, err
	} else if !ok {
		return out, ErrAlreadyUndone
	}
	device := Device(ruleID)
	for _, wr := range list {
		ops, restored, err := e.undoEntity(ctx, ruleID, run.OccurrenceKey, wr, nowMs, ts, device)
		if err != nil {
			return out, err
		}
		if !restored {
			out.Kept++
			continue
		}
		res, err := e.Sync.ApplyStrict(withUndo(ctx), uid, ops)
		if err != nil {
			out.Kept++
			continue
		}
		if res.Applied > 0 {
			e.Sync.NotifyApplied(res, device)
		}
		out.Restored++
	}
	return out, nil
}

func appendOnce(list []string, s string) []string {
	if slices.Contains(list, s) {
		return list
	}
	return append(list, s)
}

// undoEntity plans one entity's undo; restored is false when everything it
// wrote changed since (kept).
func (e *Engine) undoEntity(ctx context.Context, ruleID, key string, wr written, nowMs, ts int64, device string) ([]opsync.Op, bool, error) {
	mine := func(f string) string { return opID(ruleID, key, wr.ID, f) }
	op := func(f string, v json.RawMessage) opsync.Op {
		return opsync.Op{ID: ids.NameID("rule-undo", ruleID+"\x00"+key+"\x00"+wr.ID+"\x00"+f), Entity: wr.Entity, EntityID: wr.ID, Field: f, Value: v, TS: ts, Device: device}
	}
	still := map[string]*fieldOp{}
	for _, f := range wr.Fields {
		list, err := e.fieldOps(ctx, wr.Entity, wr.ID, f)
		if err != nil {
			return nil, false, err
		}
		if w := winner(list, ""); w != nil && w.opID == mine(f) {
			still[f] = winner(list, mine(f))
		}
	}
	if wr.Created {
		if len(still) < len(wr.Fields) {
			return nil, false, nil // changed since: kept
		}
		if wr.Entity == "time_entry" {
			return []opsync.Op{op("ended_at", raw(nowMs))}, true, nil
		}
		return []opsync.Op{op("deleted_at", raw(nowMs))}, true, nil
	}
	fields := make([]string, 0, len(still))
	for f := range still {
		fields = append(fields, f)
	}
	sort.Strings(fields)
	var ops []opsync.Op
	for _, f := range fields {
		if wr.Entity == "time_entry" && f == "ended_at" {
			continue // a timer it stopped stays stopped
		}
		prev := nullJSON
		if def, ok := opsync.Schema[wr.Entity][f]; ok && def.Default != "" {
			prev = json.RawMessage(def.Default)
		}
		if p := still[f]; p != nil {
			prev = p.value
		}
		ops = append(ops, op(f, prev))
	}
	return ops, len(ops) > 0, nil
}
