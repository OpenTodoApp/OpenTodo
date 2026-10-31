package sync

import (
	"database/sql"
	"encoding/json"
	"errors"
)

// ReasonInvalidOccurrence refuses a task.occurrence_date op (OpenSpec change
// series-exceptions, design D1): the date an occurrence record stands for is
// written once, on a task that names its series, and never changed.
const ReasonInvalidOccurrence = "invalid_occurrence_date"

// noteSeries remembers the tasks this batch gives a series_id, so a record's
// occurrence_date may arrive in the same batch that creates it.
func (r *resolver) noteSeries(op Op) {
	if op.Entity == "task" && op.Field == "series_id" && !IsNull(op.Value) {
		if r.batchSeries == nil {
			r.batchSeries = map[string]bool{}
		}
		r.batchSeries[op.EntityID] = true
	}
}

// checkOccurrenceDate refuses occurrence_date on a task without series_id (in
// the store or in this batch) and any value other than the one already stored.
func (r *resolver) checkOccurrenceDate(op Op, scope string) (string, error) {
	stored, err := r.storedTaskField(scope, op.EntityID, "occurrence_date")
	if err != nil {
		return "", err
	}
	if !IsNull(stored) {
		if IsNull(op.Value) || StringOf(stored) != StringOf(op.Value) {
			return ReasonInvalidOccurrence, nil
		}
		return "", nil
	}
	if IsNull(op.Value) || r.batchSeries[op.EntityID] {
		return "", nil
	}
	series, err := r.storedTaskField(scope, op.EntityID, "series_id")
	if err != nil {
		return "", err
	}
	if StringOf(series) == "" {
		return ReasonInvalidOccurrence, nil
	}
	return "", nil
}

// storedTaskField is the stored value of one field of a task in scope, nil
// when the task or the field has none.
func (r *resolver) storedTaskField(scope, id, field string) (json.RawMessage, error) {
	var value sql.NullString
	err := r.tx.QueryRowContext(r.ctx, `SELECT value FROM scope_fields WHERE scope_id = ? AND entity = 'task' AND entity_id = ? AND field = ?`,
		scope, id, field).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil || !value.Valid {
		return nil, err
	}
	return json.RawMessage(value.String), nil
}
