package sync

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// ReasonInvalidDay refuses a note.day op (OpenSpec change daily-notes, design
// D1): a daily note's day is written once, on the note whose id is the
// name-based id of its author and that day, and never changed.
const ReasonInvalidDay = "invalid_day"

// DailyNoteID is the id of user's daily note for day (YYYY-MM-DD), the same on
// every device (web/src/lib/dailyNotes.ts dailyNoteId).
func DailyNoteID(userID, day string) string {
	return ids.NameID("daily-note", userID+":"+day)
}

// checkNoteDay refuses a day that is not a calendar date, a day on a note whose
// id is not the author's daily note of that day, and any change of a day
// already stored (clearing it included).
func (r *resolver) checkNoteDay(op Op, scope string) (string, error) {
	day := StringOf(op.Value)
	stored, err := r.storedField(scope, "note", op.EntityID, "day")
	if err != nil {
		return "", err
	}
	if old := StringOf(stored); old != "" {
		if day != old {
			return ReasonInvalidDay, nil
		}
		return "", nil
	}
	if day == "" {
		return "", nil
	}
	if _, err := time.Parse("2006-01-02", day); err != nil {
		return ReasonInvalidDay, nil
	}
	if op.EntityID != DailyNoteID(r.acc.userID, day) {
		return ReasonInvalidDay, nil
	}
	return "", nil
}

// storedField is the stored value of one field of an entity in scope, nil when
// the entity or the field has none.
func (r *resolver) storedField(scope, entity, id, field string) (json.RawMessage, error) {
	var value sql.NullString
	err := r.tx.QueryRowContext(r.ctx, `SELECT value FROM scope_fields WHERE scope_id = ? AND entity = ? AND entity_id = ? AND field = ?`,
		scope, entity, id, field).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil || !value.Valid {
		return nil, err
	}
	return json.RawMessage(value.String), nil
}
