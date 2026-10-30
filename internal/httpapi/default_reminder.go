package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"

	"github.com/OpenTodoApp/opentodo/internal/defaultreminder"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// Default reminders through REST and agents (OpenSpec change default-reminders,
// design D6): the task routes apply the person's defaults only when the caller
// asks with ?default_reminder=true (scripts and integrations keep today's
// behaviour); the agent write tools always apply them. The rule itself is the
// shared internal/defaultreminder.

// defaultReminderFlag reads the optional default_reminder query parameter of a
// task write: "true" or "false", false when absent. Any other value answers 400
// and reports !ok, before anything is written. Other collections ignore it.
func defaultReminderFlag(w http.ResponseWriter, r *http.Request, entity string) (on, ok bool) {
	q := r.URL.Query()
	if entity != "task" || !q.Has("default_reminder") {
		return false, true
	}
	switch q.Get("default_reminder") {
	case "true":
		return true, true
	case "false":
		return false, true
	}
	writeError(w, http.StatusBadRequest, "invalid_input", "default_reminder must be true or false")
	return false, false
}

// defaultReminderOps plans the default reminder of one write by uid to task
// taskID (nil before: the write creates it), stamped with the task ops' ts and
// device. batch holds the write's other ops (reminders it adds count). opID,
// when set, derives the op ids (an Idempotency-Key create).
func (s *Server) defaultReminderOps(ctx context.Context, uid, taskID string, before opsync.Entity, patch map[string]json.RawMessage, batch []opsync.Op, ts int64, device string, opID func(entityID, field string) string) ([]opsync.Op, error) {
	if zoned.DecodeDue(patch["due"]) == nil {
		return nil, nil
	}
	row, err := s.sync.Get(ctx, uid, "user_prefs", "me")
	if err != nil {
		return nil, err
	}
	prefs := defaultreminder.ReadPrefs(row)
	if !prefs.Set() {
		return nil, nil
	}
	all, err := s.sync.List(ctx, uid, "reminder", true)
	if err != nil {
		return nil, err
	}
	var reminders []map[string]json.RawMessage
	for _, rem := range all {
		if idOf(rem["task_id"]) == taskID {
			reminders = append(reminders, rem)
		}
	}
	plan := defaultreminder.Plan(defaultreminder.Input{
		UserID: uid, TaskID: taskID, Before: before, Patch: patch, Reminders: reminders,
		Batch: reminderChanges(batch), Prefs: prefs, Loc: s.tzLocation(ctx, uid), Now: s.now().UnixMilli(),
	})
	var ops []opsync.Op
	for _, c := range plan {
		fields := make([]string, 0, len(c.Patch))
		for f := range c.Patch {
			fields = append(fields, f)
		}
		sort.Strings(fields)
		for _, f := range fields {
			id := ids.New()
			if opID != nil {
				id = opID(c.ID, f)
			}
			ops = append(ops, opsync.Op{ID: id, Entity: "reminder", EntityID: c.ID, Field: f, Value: c.Patch[f], TS: ts, Device: device})
		}
	}
	return ops, nil
}

// reminderChanges groups a batch's reminder ops per reminder.
func reminderChanges(ops []opsync.Op) []defaultreminder.Change {
	var out []defaultreminder.Change
	at := map[string]int{}
	for _, op := range ops {
		if op.Entity != "reminder" {
			continue
		}
		i, ok := at[op.EntityID]
		if !ok {
			i = len(out)
			at[op.EntityID] = i
			out = append(out, defaultreminder.Change{ID: op.EntityID, Patch: map[string]json.RawMessage{}})
		}
		out[i].Patch[op.Field] = op.Value
	}
	return out
}

// withoutFollowUps drops the due follow-ups of reminders the default rule
// already rewrites (a default reminder switching kind, design D5), so the
// batch carries one firing time per reminder.
func withoutFollowUps(followUps, defaults []opsync.Op) []opsync.Op {
	if len(defaults) == 0 {
		return followUps
	}
	planned := map[string]bool{}
	for _, op := range defaults {
		planned[op.EntityID] = true
	}
	out := followUps[:0:0]
	for _, op := range followUps {
		if !planned[op.EntityID] {
			out = append(out, op)
		}
	}
	return out
}

// agentReminderOps are the reminder ops an agent write of a task adds: the
// person's default reminder (agents always apply it) and the follow-ups of a
// new due date or deadline, as a REST write would.
func (s *Server) agentReminderOps(ctx context.Context, uid, taskID string, create bool, patch map[string]json.RawMessage, ts int64, device string) ([]opsync.Op, error) {
	var before opsync.Entity
	if !create {
		var err error
		if before, err = s.sync.Get(ctx, uid, "task", taskID); err != nil {
			return nil, err
		}
	}
	dops, err := s.defaultReminderOps(ctx, uid, taskID, before, patch, nil, ts, device, nil)
	if err != nil || create {
		return dops, err
	}
	rops, err := s.reminderOpsForTaskAs(ctx, uid, taskID, patch, ts, device)
	if err != nil {
		return nil, err
	}
	return append(dops, withoutFollowUps(rops, dops)...), nil
}

// createDefaultReminder is the default reminder of a REST task create with
// ?default_reminder=true; a keyed create derives its op ids from the key.
func (s *Server) createDefaultReminder(ctx context.Context, uid, id string, body map[string]json.RawMessage, ts int64, on, keyed bool) ([]opsync.Op, error) {
	if !on {
		return nil, nil
	}
	var opID func(string, string) string
	if keyed {
		opID = idemOpID
	}
	return s.defaultReminderOps(ctx, uid, id, nil, body, nil, ts, serverDevice, opID)
}

// patchReminderOps are the reminder ops of a REST task PATCH: relative
// reminders follow the due date and deadline reminders the deadline, stamped
// like the task op (reminders D2, deadlines D5), and with ?default_reminder=true
// the person's default reminder joins the write.
func (s *Server) patchReminderOps(ctx context.Context, uid, taskID string, existing opsync.Entity, body map[string]json.RawMessage, ts int64, withDefault bool) ([]opsync.Op, error) {
	var dops []opsync.Op
	if withDefault {
		var err error
		if dops, err = s.defaultReminderOps(ctx, uid, taskID, existing, body, nil, ts, serverDevice, nil); err != nil {
			return nil, err
		}
	}
	rops, err := s.reminderOpsForTask(ctx, uid, taskID, body, ts)
	if err != nil {
		return nil, err
	}
	return append(dops, withoutFollowUps(rops, dops)...), nil
}
