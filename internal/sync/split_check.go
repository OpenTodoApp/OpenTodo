package sync

import (
	"encoding/json"
	"errors"
	"fmt"
)

// ReasonInvalidSplit refuses a task.split_from op (OpenSpec change series-split,
// design D2): a piece names its series once, at creation, on a task with a rule,
// and the series is in the piece's sharing scope.
const ReasonInvalidSplit = "invalid_split_from"

// SplitFrom is the value of task.split_from.
type SplitFrom struct {
	Series string `json:"series"`
	Date   string `json:"date"`
}

// DecodeSplitFrom reads a task.split_from value; ok=false for null or a malformed one.
func DecodeSplitFrom(raw json.RawMessage) (SplitFrom, bool) {
	var s SplitFrom
	if IsNull(raw) || json.Unmarshal(raw, &s) != nil || s.Series == "" || !isDate(s.Date) {
		return SplitFrom{}, false
	}
	return s, true
}

// checkSplit accepts {series, date}: a non-empty id and an existing date, nothing else.
func checkSplit(raw json.RawMessage) error {
	var members map[string]json.RawMessage
	if err := json.Unmarshal(raw, &members); err != nil || len(members) != 2 || members["series"] == nil || members["date"] == nil {
		return errors.New(`must be null or {"series": id, "date": "YYYY-MM-DD"}`)
	}
	if err := checkID(members["series"]); err != nil {
		return fmt.Errorf("series %v", err)
	}
	if isNullValue(members["date"]) || checkDate(members["date"]) != nil {
		return errors.New(`date must be a date "YYYY-MM-DD" that exists`)
	}
	return nil
}

// noteRule remembers the tasks this batch gives a rule, so a piece's split_from
// may arrive in the batch that creates it.
func (r *resolver) noteRule(op Op) {
	if op.Entity == "task" && op.Field == "recurrence" && !IsNull(op.Value) {
		if r.batchRule == nil {
			r.batchRule = map[string]bool{}
		}
		r.batchRule[op.EntityID] = true
	}
}

// checkSplitFrom refuses split_from as a change of a stored value, on a task
// with no rule (stored or in this batch) and naming a series in another scope.
// A series the server does not hold is accepted, as blocked_by's are.
func (r *resolver) checkSplitFrom(op Op, scope string) (string, error) {
	stored, err := r.storedTaskField(scope, op.EntityID, "split_from")
	if err != nil {
		return "", err
	}
	if !IsNull(stored) {
		a, _ := DecodeSplitFrom(stored)
		b, ok := DecodeSplitFrom(op.Value)
		if !ok || a != b {
			return ReasonInvalidSplit, nil
		}
		return "", nil
	}
	split, ok := DecodeSplitFrom(op.Value)
	if !ok {
		return "", nil
	}
	if !r.batchRule[op.EntityID] {
		rule, err := r.storedTaskField(scope, op.EntityID, "recurrence")
		if err != nil {
			return "", err
		}
		if IsNull(rule) {
			return ReasonInvalidSplit, nil
		}
	}
	other, found, err := r.existingTaskScope(split.Series)
	if err != nil {
		return "", err
	}
	if !found && r.batchTasks[split.Series] {
		if other, err = r.scopeOfChild("task", split.Series); err != nil {
			return "", err
		}
		found = true
	}
	if found && other != scope {
		return ReasonInvalidSplit, nil
	}
	return "", nil
}
