package sync

import (
	"encoding/json"
	"errors"
	"slices"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

// The skips of an away period (OpenSpec change away-periods, design D1, D2):
// the server's port of web/src/lib/awayPlan.ts, over PlanActOn. Each covered
// series with a calendar rule has every occurrence dated in the period, from
// its current one on, skipped as "Skip this occurrence" skips it; the later
// dates first, as records, so that skipping the current one jumps over them. A
// completion-relative series due in the period moves to the day after it, and
// a habit also gets the skipped record of that date.

// AwayScope is what a period covers: every series, or those in the projects
// or with the labels chosen. A series assigned to someone other than Me is
// never covered, and one of a Shared project only when its project is chosen:
// a person's time away never moves a teammate's work.
type AwayScope struct {
	All              bool
	Projects, Labels []string
	Me               string
	Shared           map[string]bool
}

func (sc AwayScope) covers(row Entity) bool {
	if a := StringOf(row["assignee_id"]); a != "" && a != sc.Me {
		return false
	}
	p := StringOf(row["project_id"])
	if p != "" && sc.Shared[p] {
		return !sc.All && slices.Contains(sc.Projects, p)
	}
	if sc.All {
		return true
	}
	if p != "" && slices.Contains(sc.Projects, p) {
		return true
	}
	var labels []string
	_ = json.Unmarshal(row["labels"], &labels)
	for _, l := range labels {
		if slices.Contains(sc.Labels, l) {
			return true
		}
	}
	return false
}

// AwayWrite is the fields one task gets from the plan.
type AwayWrite struct {
	ID     string
	Fields map[string]json.RawMessage
	// Series is true for a series' own row (its relative reminders follow).
	Series bool
}

// AwayPlan is the plan's writes, one per task in first-seen order, and the
// occurrences skipped over how many series.
type AwayPlan struct {
	Writes      []AwayWrite
	Occurrences int
	Series      int
}

// ErrAwayTooLarge is PlanAway's answer when the plan's changes would pass the limit.
var ErrAwayTooLarge = errors.New("the period would change too many occurrences")

// PlanAway plans the skips of the period from..to over the user's live tasks
// (SeriesTasks). canEdit excludes a series the user may not edit (a viewer).
// Each series is planned over its own lineage only (awayLineages), so the
// work grows with the series and their records, not with every task; with a
// limit above 0 it stops with ErrAwayTooLarge as soon as the plan's changed
// fields pass it.
func PlanAway(tasks []Entity, scope AwayScope, from, to string, canEdit func(Entity) bool, now int64, today string, limit int) (AwayPlan, error) {
	var plan AwayPlan
	lineages := awayLineages(tasks)
	fields := 0
	for _, row := range tasks {
		id := StringOf(row["id"])
		if id == "" || StringOf(row["series_id"]) != "" || !scope.covers(row) || !canEdit(row) {
			continue
		}
		if _, ok := openSeries(id, row); !ok {
			continue
		}
		writes, n, err := planSeriesAway(id, row, from, to, lineages(id, row), now, today)
		if err != nil {
			return AwayPlan{}, err
		}
		if n == 0 {
			continue
		}
		for _, w := range writes {
			fields += len(w.Fields)
		}
		if limit > 0 && fields > limit {
			return AwayPlan{}, ErrAwayTooLarge
		}
		plan.Writes = append(plan.Writes, writes...)
		plan.Occurrences += n
		plan.Series++
	}
	return plan, nil
}

// awayLineages indexes tasks once and answers, for a series, the rows its plan
// reads (lineageOf, RecordsOf): the series, every piece of a split series and
// the rows the pieces continue, and the records of all of them.
func awayLineages(tasks []Entity) func(id string, row Entity) []Entity {
	records := map[string][]Entity{}
	var related []Entity
	named := map[string]bool{}
	for _, t := range tasks {
		if sid := StringOf(t["series_id"]); sid != "" {
			records[sid] = append(records[sid], t)
		}
		if s, ok := splitOf(t); ok && isPieceRow(t) {
			related = append(related, t)
			named[s.Series] = true
		}
	}
	for _, t := range tasks {
		if _, piece := splitOf(t); !piece && named[idValue(t["id"])] && isPieceRow(t) {
			related = append(related, t)
		}
	}
	return func(id string, row Entity) []Entity {
		out := []Entity{row}
		ids := []string{id}
		for _, t := range related {
			if tid := idValue(t["id"]); tid != id {
				out = append(out, t)
				ids = append(ids, tid)
			}
		}
		for _, sid := range ids {
			out = append(out, records[sid]...)
		}
		return out
	}
}

// planSeriesAway is the skips of one series and how many occurrences they are.
func planSeriesAway(id string, row Entity, from, to string, tasks []Entity, now int64, today string) ([]AwayWrite, int, error) {
	s, _ := openSeries(id, row)
	if s.rule.AfterCompletion() {
		due := s.dueDate(today)
		if decodeRecurringDue(row["due"]) == nil || due < from || due > to {
			return nil, 0, nil
		}
		after := dayAfter(to)
		out := []AwayWrite{{ID: id, Fields: movedDates(row, due, after), Series: true}}
		rec := OccurrenceID(id, due)
		if string(row["habit"]) == "true" && !hasRecord(id, rec, tasks) {
			fields := occurrenceRecord(row, id, due, due, now)
			fields["completed_at"], fields["skipped"] = JSONOf(now), json.RawMessage("true")
			out = append([]AwayWrite{{ID: rec, Fields: fields}}, out...)
		}
		return out, 1, nil
	}
	w := newAwayWork(id, row, tasks)
	skip := func(date, on string) (bool, error) {
		p, err := PlanActOn(id, w.series(), date, OccurrenceAction{Kind: "skip"}, w.list(), now, on)
		if err == ErrNotAnOccurrence || err == ErrNotRecurring {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if p.Record != nil {
			w.set(p.RecordID, p.Record, false)
		}
		if p.Series != nil {
			w.set(id, p.Series, true)
		}
		w.skipped++
		return true, nil
	}
	for round := 0; round < 3; round++ {
		ws := w.seriesRow()
		current, ok, err := ws.current(w.list(), today)
		if err != nil {
			return nil, 0, err
		}
		if !ok || current > to {
			break
		}
		own := map[string]bool{}
		for _, r := range RecordsOf(id, w.list()) {
			own[r.Date] = true
		}
		on := today
		if current < today {
			on = current
		}
		start := from
		if current >= from {
			start = dayAfter(current)
		}
		for d := start; d <= to; d = dayAfter(d) {
			if d <= current || own[d] {
				continue
			}
			if ok, err := ws.actionable(d, current, w.list(), on); err != nil {
				return nil, 0, err
			} else if ok {
				if _, err := skip(d, on); err != nil {
					return nil, 0, err
				}
			}
		}
		if current < from || own[current] {
			break
		}
		if moved, err := skip(current, on); err != nil {
			return nil, 0, err
		} else if !moved {
			break
		}
	}
	return w.writes(), w.skipped, nil
}

func dayAfter(d string) string { return recurrence.AddDays(d, 1) }

func hasRecord(seriesID, recordID string, tasks []Entity) bool {
	for _, r := range RecordsOf(seriesID, tasks) {
		if r.ID == recordID {
			return true
		}
	}
	return false
}

// awayWork is the working copy one series' plan reads: the user's tasks with
// the plan's writes so far folded in.
type awayWork struct {
	id      string
	rows    map[string]Entity
	order   []string
	base    []Entity
	written map[string]AwayWrite
	worder  []string
	skipped int
}

func newAwayWork(id string, row Entity, tasks []Entity) *awayWork {
	w := &awayWork{id: id, rows: map[string]Entity{}, written: map[string]AwayWrite{}}
	for _, t := range tasks {
		tid := StringOf(t["id"])
		if tid == id {
			t = row
		}
		w.rows[tid] = t
		w.order = append(w.order, tid)
	}
	return w
}

func (w *awayWork) series() Entity       { return w.rows[w.id] }
func (w *awayWork) seriesRow() seriesRow { s, _ := openSeries(w.id, w.series()); return s }
func (w *awayWork) list() []Entity {
	if w.base == nil {
		w.base = make([]Entity, 0, len(w.order))
		for _, id := range w.order {
			w.base = append(w.base, w.rows[id])
		}
	}
	return w.base
}
func (w *awayWork) set(id string, f map[string]json.RawMessage, series bool) {
	row := Entity{}
	for k, v := range w.rows[id] {
		row[k] = v
	}
	for k, v := range f {
		row[k] = v
	}
	row["id"] = JSONOf(id)
	if _, ok := w.rows[id]; !ok {
		w.order = append(w.order, id)
	}
	w.rows[id] = row
	prev, ok := w.written[id]
	if !ok {
		prev = AwayWrite{ID: id, Fields: map[string]json.RawMessage{}, Series: series}
		w.worder = append(w.worder, id)
	}
	for k, v := range f {
		prev.Fields[k] = v
	}
	w.written[id] = prev
	w.base = nil
}

func (w *awayWork) writes() []AwayWrite {
	out := make([]AwayWrite, 0, len(w.worder))
	for _, id := range w.worder {
		out = append(out, w.written[id])
	}
	return out
}
