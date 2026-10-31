package sync

import (
	"database/sql"
	"encoding/json"
	"errors"
)

// Time entries (OpenSpec change `time-tracking`, design D1). A time entry is
// one stretch of work on a task: an entity in the op log that lives in the
// scope of its task, with authorship checked per op at receipt time:
//
//   - creating needs a task the author can write (owners, admins and editors;
//     viewers may comment but not track) and a user_id equal to the submitter;
//   - task_id and user_id never change after creation;
//   - started_at, ended_at, note, device_id and created_at are the author's alone;
//   - deleted_at may be set by the author, a project admin or the owner;
//   - ops for an entry whose task was purged are discarded like comments';
//   - planned_end_at is never before the entry's started_at (OpenSpec change
//     focus-session-readable, design D2): the batch's winning started_at, or
//     the stored one, decides; an earlier value is refused with
//     ReasonInvalidPlannedEnd and the stored value travels back.
//
// The server never repairs two running entries on the sync path: every device
// runs the same rule (internal/timetrack, web/src/lib/time.ts) and writes the
// same values, so the repair converges without the server.

// ReasonInvalidPlannedEnd refuses a time_entry.planned_end_at earlier than
// the entry's started_at (focus-session-readable D2).
const ReasonInvalidPlannedEnd = "invalid_planned_end"

// batchTimeEntry is what a batch says about an entry it creates, and the
// winning started_at op it carries for any entry.
type batchTimeEntry struct {
	task, user string
	started    *Op
}

// timeEntryState is what the resolver learned about one entry id.
type timeEntryState struct {
	found      bool   // stored before this batch
	scope      string // the stored entry's scope ("" when invisible to the submitter)
	task, user string
}

// noteTimeEntry collects the winning task_id and user_id of entries created in
// a batch, so a new entry's ops can be placed whatever their order.
func (r *resolver) noteTimeEntry(op Op) {
	if op.Entity != "time_entry" || (op.Field != "task_id" && op.Field != "user_id" && op.Field != "started_at") {
		return
	}
	b := r.batchTimeEntry[op.EntityID]
	if b == nil {
		b = &batchTimeEntry{}
		r.batchTimeEntry[op.EntityID] = b
	}
	switch op.Field {
	case "task_id":
		b.task = idValue(op.Value)
	case "user_id":
		b.user = idValue(op.Value)
	default:
		if b.started == nil || Wins(op.TS, op.Device, b.started.TS, b.started.Device) {
			o := op
			b.started = &o
		}
	}
}

// plannedEndOK reports whether a planned_end_at op is not before the entry's
// started_at: the batch's winning value when it carries one, else the value
// stored in scope. An entry without a known start accepts any instant.
func (r *resolver) plannedEndOK(op Op, scope string) (bool, error) {
	var end int64
	if isNullValue(op.Value) || json.Unmarshal(op.Value, &end) != nil {
		return true, nil
	}
	var started int64
	if b := r.batchTimeEntry[op.EntityID]; b != nil && b.started != nil {
		_ = json.Unmarshal(b.started.Value, &started)
	} else {
		var raw string
		err := r.tx.QueryRowContext(r.ctx, `SELECT value FROM scope_fields WHERE scope_id = ? AND entity = 'time_entry' AND entity_id = ? AND field = 'started_at'`,
			scope, op.EntityID).Scan(&raw)
		if errors.Is(err, sql.ErrNoRows) {
			return true, nil
		}
		if err != nil {
			return false, err
		}
		_ = json.Unmarshal([]byte(raw), &started)
	}
	return started <= 0 || end >= started, nil
}

// resolveTimeEntry places a time entry op and, once placed, checks a planned
// end against the entry's start.
func (r *resolver) resolveTimeEntry(op Op) (scope, reason string, err error) {
	scope, reason, err = r.placeTimeEntry(op)
	if err != nil || reason != "" || op.Field != "planned_end_at" {
		return scope, reason, err
	}
	ok, err := r.plannedEndOK(op, scope)
	if err != nil {
		return "", "", err
	}
	if !ok {
		return "", ReasonInvalidPlannedEnd, nil
	}
	return scope, "", nil
}

// timeEntry looks an entry up in every scope (once per batch,
// entity-id-ownership).
func (r *resolver) timeEntry(id string) (*timeEntryState, error) {
	if st, ok := r.timeEntries[id]; ok {
		return st, nil
	}
	st := &timeEntryState{}
	var err error
	if st.found, st.scope, st.task, st.user, err = r.pairHome("time_entry", id, "task_id", "user_id"); err != nil {
		return nil, err
	}
	r.timeEntries[id] = st
	return st, nil
}

// placeTimeEntry places a time entry op in its task's scope and applies the
// authorship rules above.
func (r *resolver) placeTimeEntry(op Op) (scope, reason string, err error) {
	st, err := r.timeEntry(op.EntityID)
	if err != nil {
		return "", "", err
	}
	if st.found {
		if st.scope == "" {
			return "", ReasonForbidden, nil
		}
		switch op.Field {
		case "user_id":
			if idValue(op.Value) != st.user {
				return "", ReasonForbidden, nil
			}
		case "task_id":
			if idValue(op.Value) != st.task {
				return "", ReasonForbidden, nil
			}
		case "deleted_at":
			role := r.acc.roleIn(st.scope)
			if st.user != r.acc.userID && role != RoleOwner && role != RoleAdmin {
				return "", ReasonForbidden, nil
			}
		default:
			if st.user != r.acc.userID {
				return "", ReasonForbidden, nil
			}
		}
		return st.scope, "", nil
	}
	// A new entry: the batch must name its task and its user, the user must be
	// the submitter, and every op must agree with those values.
	b := r.batchTimeEntry[op.EntityID]
	if b == nil || b.task == "" || b.user != r.acc.userID {
		return "", ReasonForbidden, nil
	}
	if (op.Field == "user_id" && idValue(op.Value) != b.user) || (op.Field == "task_id" && idValue(op.Value) != b.task) {
		return "", ReasonForbidden, nil
	}
	scope, found, err := r.existingTaskScope(b.task)
	if err != nil {
		return "", "", err
	}
	if !found {
		if !r.batchTasks[b.task] {
			// A purged task takes its late entries with it; one that never
			// existed cannot be tracked.
			var one int
			err := r.tx.QueryRowContext(r.ctx, `SELECT 1 FROM purges WHERE entity = 'task' AND entity_id = ? LIMIT 1`, b.task).Scan(&one)
			if err == nil {
				return "", reasonDiscard, nil
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return "", "", err
			}
			return "", ReasonForbidden, nil
		}
		if scope, err = r.scopeOfChild("task", b.task); err != nil {
			return "", "", err
		}
	}
	if scope == "" || !r.acc.canSee(scope) {
		return "", ReasonForbidden, nil
	}
	// Tracking is work on the task: whoever may edit tasks there may track.
	if !CanWrite(r.acc.roleIn(scope), "task", "title") {
		return "", ReasonForbidden, nil
	}
	return scope, "", nil
}
