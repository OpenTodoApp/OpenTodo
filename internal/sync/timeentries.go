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
//   - ops for an entry whose task was purged are discarded like comments'.
//
// The server never repairs two running entries on the sync path: every device
// runs the same rule (internal/timetrack, web/src/lib/time.ts) and writes the
// same values, so the repair converges without the server.

// batchTimeEntry is what a batch says about an entry it creates.
type batchTimeEntry struct {
	task, user string
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
	if op.Entity != "time_entry" || (op.Field != "task_id" && op.Field != "user_id") {
		return
	}
	b := r.batchTimeEntry[op.EntityID]
	if b == nil {
		b = &batchTimeEntry{}
		r.batchTimeEntry[op.EntityID] = b
	}
	if op.Field == "task_id" {
		b.task = idValue(op.Value)
	} else {
		b.user = idValue(op.Value)
	}
}

// timeEntry looks an entry up among the submitter's personal scope and every
// project scope (once per batch).
func (r *resolver) timeEntry(id string) (*timeEntryState, error) {
	if st, ok := r.timeEntries[id]; ok {
		return st, nil
	}
	rows, err := r.tx.QueryContext(r.ctx, `SELECT scope_id, field, value FROM scope_fields
		WHERE entity = 'time_entry' AND entity_id = ? AND field IN ('task_id','user_id') AND (scope_id = ? OR scope_id LIKE 'project:%')`,
		id, r.acc.personal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type vals struct{ task, user string }
	byScope := map[string]*vals{}
	for rows.Next() {
		var sc, field, value string
		if err := rows.Scan(&sc, &field, &value); err != nil {
			return nil, err
		}
		v := byScope[sc]
		if v == nil {
			v = &vals{}
			byScope[sc] = v
		}
		if field == "task_id" {
			v.task = idValue(json.RawMessage(value))
		} else {
			v.user = idValue(json.RawMessage(value))
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	st := &timeEntryState{}
	best := 99
	for sc, v := range byScope {
		if rk := r.acc.rank(sc); rk < best {
			best = rk
			st.found, st.scope, st.task, st.user = true, sc, v.task, v.user
		}
	}
	if st.found && !r.acc.canSee(st.scope) {
		st.scope = ""
	}
	r.timeEntries[id] = st
	return st, nil
}

// resolveTimeEntry places a time entry op in its task's scope and applies the
// authorship rules above.
func (r *resolver) resolveTimeEntry(op Op) (scope, reason string, err error) {
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
