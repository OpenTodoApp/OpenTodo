package sync

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// ReasonSeriesDateTaken refuses a strict write that moves a recurring series
// onto a date that has one of its lineage's records (OpenSpec change
// server-series-move, #1991): the app's repair would move the series straight
// on again (PlanRepair), so the write is refused with the reason instead of
// confirmed and then undone. The app refuses the same dates itself (web
// exceptionOn, series-move-onto-exception). Apply, the sync path, never refuses
// it: devices replay history and converge through the repair.
const ReasonSeriesDateTaken = "series_date_taken"

// seriesMove is a series whose due a strict batch writes: its scope, the due
// date it had before the batch and the last due op, the one a refusal names.
type seriesMove struct {
	scope, from string
	op          Op
}

// noteDueWrite remembers, in a strict batch, an existing task whose due this
// op writes. A task the batch creates is left out: it has no records yet, and
// a new piece of a split takes the date its plan chose.
func (b *applyBatch) noteDueWrite(op Op, scope string) error {
	if !b.strict || op.Entity != "task" || op.Field != "due" || b.creates[op.EntityID] {
		return nil
	}
	if m := b.dueMoves[op.EntityID]; m != nil {
		m.op = op
		return nil
	}
	prev, err := b.rs.storedTaskField(scope, op.EntityID, "due")
	if err != nil {
		return err
	}
	from := ""
	if d := decodeRecurringDue(prev); d != nil {
		from = d.Date
	}
	b.dueMoves[op.EntityID] = &seriesMove{scope: scope, from: from, op: op}
	return nil
}

// checkSeriesMoves refuses the batch when it leaves a series due on another
// date than before and that date has a record of its lineage (ExceptionOn).
// It reads the rows as the batch left them, so a batch that trashes a record
// and moves the series onto its date (an undo) is accepted.
func (b *applyBatch) checkSeriesMoves() error {
	ids := make([]string, 0, len(b.dueMoves))
	for id := range b.dueMoves {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		m := b.dueMoves[id]
		row, err := b.rs.taskRow(m.scope, id)
		if err != nil {
			return err
		}
		due := decodeRecurringDue(row["due"])
		if due == nil || due.Date == m.from {
			continue
		}
		if s, ok := openSeries(id, row); !ok || s.rule.AfterCompletion() {
			continue
		}
		tasks, err := b.rs.lineageOn(m.scope, id, row, due.Date)
		if err != nil {
			return err
		}
		state := ExceptionOn(id, row, due.Date, tasks)
		if state == "" {
			continue
		}
		if state == RecordOpen {
			state = "moved"
		}
		detail := due.Date + " " + state
		if err := b.reject(m.op, ReasonSeriesDateTaken, detail, Rejection{ID: m.op.ID, Reason: ReasonSeriesDateTaken}); err != nil {
			return err
		}
	}
	return nil
}

// SeriesDateTaken reads a ReasonSeriesDateTaken refusal: the date and why it is
// taken, "done", "skipped" or "moved".
func SeriesDateTaken(rej *RejectedError) (date, state string) {
	date, state, _ = strings.Cut(rej.Detail, " ")
	return date, state
}

// SeriesDateMessage is the sentence the REST API, the CLI and the assistant
// tools give for a ReasonSeriesDateTaken refusal.
func SeriesDateMessage(rej *RejectedError) string {
	date, state := SeriesDateTaken(rej)
	what := "was moved"
	switch state {
	case "done":
		what = "is already done"
	case "skipped":
		what = "was skipped"
	}
	return fmt.Sprintf("task.due: the occurrence of %s %s, so this recurring task cannot move there; choose another date", date, what)
}

// taskRow is the stored task id in scope as an entity, nil when it has no field there.
func (r *resolver) taskRow(scope, id string) (Entity, error) {
	rows, err := r.tx.QueryContext(r.ctx, `SELECT field, value FROM scope_fields WHERE scope_id = ? AND entity = 'task' AND entity_id = ?`, scope, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var e Entity
	for rows.Next() {
		var field, value string
		if err := rows.Scan(&field, &value); err != nil {
			return nil, err
		}
		if e == nil {
			e = Entity{"id": JSONOf(id)}
		}
		e[field] = json.RawMessage(value)
	}
	return e, rows.Err()
}

// lineageOn reads the rows ExceptionOn needs for the series id (row) on date:
// the pieces of split series in scope (a lineage stays in one scope,
// checkSplitFrom) and, for each piece of its lineage, the record of date,
// found by its derived id.
func (r *resolver) lineageOn(scope, id string, row Entity, date string) ([]Entity, error) {
	rows, err := r.tx.QueryContext(r.ctx, `SELECT entity_id, value FROM scope_fields WHERE scope_id = ? AND entity = 'task' AND field = 'split_from' AND value != 'null'`, scope)
	if err != nil {
		return nil, err
	}
	want := map[string]bool{}
	if s, ok := DecodeSplitFrom(row["split_from"]); ok {
		want[s.Series] = true
	}
	for rows.Next() {
		var pid, value string
		if err := rows.Scan(&pid, &value); err != nil {
			rows.Close()
			return nil, err
		}
		if s, ok := DecodeSplitFrom(json.RawMessage(value)); ok {
			want[pid], want[s.Series] = true, true
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	delete(want, id)
	tasks := []Entity{row}
	for _, pid := range sortedKeys(want) {
		t, err := r.taskRow(scope, pid)
		if err != nil {
			return nil, err
		}
		if t != nil {
			tasks = append(tasks, t)
		}
	}
	for _, p := range lineageOf(id, row, tasks) {
		rec, err := r.taskRow(scope, OccurrenceID(p.id, date))
		if err != nil {
			return nil, err
		}
		if rec != nil {
			tasks = append(tasks, rec)
		}
	}
	return tasks, nil
}
