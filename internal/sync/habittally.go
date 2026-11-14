package sync

import (
	"database/sql"
	"errors"
)

// Habit tallies (OpenSpec change `habit-targets`, design D2). A tally is one
// device's count toward one day of an amount habit: an entity in the op log
// that lives in the scope of its habit series (the day's occurrence record
// may not exist yet: it is written when the day is done).
//
//   - creating needs a series the submitter can see and a role that may edit
//     tasks there, and the batch must name the series;
//   - series_id, date and device never change after creation;
//   - ops for a tally whose series was purged are discarded like comments'.
//
// The id is NameID(series_id + ":" + date + ":" + device), so a device writes
// only its own row; the server does not check the id, it keeps the key fixed.

// tallyState is what the resolver learned about one tally id.
type tallyState struct {
	found bool   // stored before this batch
	scope string // the stored tally's scope ("" when invisible to the submitter)
	key   tallyKey
}

// tallyKey is what never changes on a tally: its series, date and device.
type tallyKey [3]string

var tallyKeyFields = map[string]int{"series_id": 0, "date": 1, "device": 2}

// noteTally collects the key fields of tallies created in a batch.
func (r *resolver) noteTally(op Op) {
	i, ok := tallyKeyFields[op.Field]
	if op.Entity != "habit_tally" || !ok {
		return
	}
	b := r.batchTally[op.EntityID]
	if b == nil {
		b = &tallyKey{}
		r.batchTally[op.EntityID] = b
	}
	b[i] = string(op.Value)
}

// keyChanged reports an op that would change a field of key.
func keyChanged(op Op, key tallyKey) bool {
	i, ok := tallyKeyFields[op.Field]
	return ok && string(op.Value) != key[i]
}

// tally looks a tally up in every scope, once per batch.
func (r *resolver) tally(id string) (*tallyState, error) {
	if st, ok := r.tallies[id]; ok {
		return st, nil
	}
	st := &tallyState{}
	found, scope, _, _, err := r.pairHome("habit_tally", id, "series_id", "device")
	if err != nil {
		return nil, err
	}
	st.found, st.scope = found, scope
	if scope != "" {
		rows, err := r.tx.QueryContext(r.ctx, `SELECT field, value FROM scope_fields WHERE scope_id = ? AND entity = 'habit_tally' AND entity_id = ? AND field IN ('series_id','date','device')`, scope, id)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var f, v string
			if err := rows.Scan(&f, &v); err != nil {
				return nil, err
			}
			st.key[tallyKeyFields[f]] = v
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	r.tallies[id] = st
	return st, nil
}

// resolveTally places a tally op in its record's scope.
func (r *resolver) resolveTally(op Op) (scope, reason string, err error) {
	st, err := r.tally(op.EntityID)
	if err != nil {
		return "", "", err
	}
	if st.found {
		if st.scope == "" {
			return "", ReasonForbidden, nil
		}
		if keyChanged(op, st.key) {
			return "", ReasonForbidden, nil
		}
		if !CanWrite(r.acc.roleIn(st.scope), "task", "completed_at") {
			return "", ReasonForbidden, nil
		}
		return st.scope, "", nil
	}
	b := r.batchTally[op.EntityID]
	if b == nil || idValue([]byte(b[0])) == "" || keyChanged(op, *b) {
		return "", ReasonForbidden, nil
	}
	series := idValue([]byte(b[0]))
	scope, found, err := r.existingTaskScope(series)
	if err != nil {
		return "", "", err
	}
	if !found {
		if !r.batchTasks[series] {
			var one int
			err := r.tx.QueryRowContext(r.ctx, `SELECT 1 FROM purges WHERE entity = 'task' AND entity_id = ? LIMIT 1`, series).Scan(&one)
			if err == nil {
				return "", reasonDiscard, nil
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return "", "", err
			}
			return "", ReasonForbidden, nil
		}
		if scope, err = r.scopeOfChild("task", series); err != nil {
			return "", "", err
		}
	}
	if scope == "" || !r.acc.canSee(scope) || !CanWrite(r.acc.roleIn(scope), "task", "completed_at") {
		return "", ReasonForbidden, nil
	}
	return scope, "", nil
}
