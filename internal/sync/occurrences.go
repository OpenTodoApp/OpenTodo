package sync

import (
	"encoding/json"
	"errors"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

// Acting on one occurrence of a series (OpenSpec change series-exceptions,
// design D2): the server's port of web/src/lib/recurring.ts, pinned with it by
// web/src/lib/series.fixture.json. An occurrence record is a task with the id
// OccurrenceID(series, date), series_id set and occurrence_date the date it
// stands for (M3); the exception dates of a series are the dates of its live
// records (M4), and `for N times` counts done and open records (M6). Pure
// functions over rows: the REST routes, RecurringCompletion and CalDAV use them.

var (
	// ErrNotRecurring: the task is not an open series with a valid rule.
	ErrNotRecurring = errors.New("not an open recurring task")
	// ErrNotAnOccurrence: the date is not one the series produces from its
	// current occurrence on (or the rule is completion-relative) and has no record.
	ErrNotAnOccurrence = errors.New("not an occurrence of the series")
)

// Record states (M3).
const (
	RecordOpen    = "open"
	RecordDone    = "done"
	RecordSkipped = "skipped"
)

// OccurrenceRecord is one live record of a series.
type OccurrenceRecord struct {
	Task  Entity
	ID    string
	Date  string
	State string
}

// RecordDate is the occurrence date a task stands for: occurrence_date, or the
// due date of a record written before the field ("" when it has neither).
func RecordDate(t Entity) string {
	if d := idValue(t["occurrence_date"]); d != "" {
		return d
	}
	if due := decodeRecurringDue(t["due"]); due != nil {
		return due.Date
	}
	return ""
}

// IsRecordOf reports whether t is an occurrence record of the series id.
func IsRecordOf(id string, t Entity) bool {
	if idValue(t["series_id"]) != id {
		return false
	}
	date := RecordDate(t)
	return date != "" && idValue(t["id"]) == OccurrenceID(id, date)
}

func recordState(t Entity) string {
	switch {
	case IsNull(t["completed_at"]):
		return RecordOpen
	case string(t["skipped"]) == "true":
		return RecordSkipped
	default:
		return RecordDone
	}
}

// RecordsOf lists the live occurrence records of series id among tasks. A
// trashed record is left out, as on the client (recordsOf).
func RecordsOf(id string, tasks []Entity) []OccurrenceRecord {
	var out []OccurrenceRecord
	for _, t := range tasks {
		if t.Deleted() || !IsRecordOf(id, t) {
			continue
		}
		out = append(out, OccurrenceRecord{Task: t, ID: idValue(t["id"]), Date: RecordDate(t), State: recordState(t)})
	}
	return out
}

// Budget is what `for N times` has used, the exception dates and, for a piece
// of a split lineage, the last date it produces (OpenSpec change series-split).
type Budget struct {
	Taken, Done int
	// Except holds the dates of every record of the lineage; Own the series' own.
	Except, Own map[string]bool
	// End is the day before the next piece starts, "" when unbounded.
	End string
}

// SeriesBudget is the budget of the series id whose stored row is row, read
// over its lineage among tasks (web seriesBudget): the done and open records
// other than the one of exceptDate, every record's date, and the bound of a
// piece. tasks holds the lineage's pieces and records (every task will do);
// today is the caller's calendar date. A nil row reads the series' own records only.
func SeriesBudget(id string, row Entity, tasks []Entity, exceptDate, today string) Budget {
	if row != nil {
		return lineageBudget(id, row, tasks, exceptDate, today)
	}
	b := Budget{Except: map[string]bool{}, Own: map[string]bool{}}
	open := 0
	for _, r := range RecordsOf(id, tasks) {
		b.Except[r.Date], b.Own[r.Date] = true, true
		if r.Date == exceptDate {
			continue
		}
		switch r.State {
		case RecordDone:
			b.Done++
		case RecordOpen:
			open++
		}
	}
	b.Taken = b.Done + open
	return b
}

// seriesRow is an open, live series with a parseable rule.
type seriesRow struct {
	id   string
	row  Entity
	rule recurrence.Rule
}

func openSeries(id string, row Entity) (seriesRow, bool) {
	if row.Deleted() || !IsNull(row["completed_at"]) {
		return seriesRow{}, false
	}
	text := StringOf(row["recurrence"])
	if text == "" {
		return seriesRow{}, false
	}
	rule, err := recurrence.Parse(text)
	if err != nil {
		return seriesRow{}, false
	}
	return seriesRow{id: id, row: row, rule: rule}, true
}

// budget is SeriesBudget over the series' lineage.
func (s seriesRow) budget(tasks []Entity, exceptDate, today string) Budget {
	return SeriesBudget(s.id, s.row, tasks, exceptDate, today)
}

// dueDate is the series' current occurrence date, today when it has no due.
func (s seriesRow) dueDate(today string) string {
	if d := decodeRecurringDue(s.row["due"]); d != nil {
		return d.Date
	}
	return today
}

// current is the occurrence the series stands on for acting: its due date, or
// the next free date when a late record made that date an exception (M5);
// ok=false when no free date remains.
func (s seriesRow) current(tasks []Entity, today string) (string, bool, error) {
	date := s.dueDate(today)
	b := s.budget(tasks, "", today)
	if b.End != "" && date > b.End {
		return "", false, nil
	}
	if !b.Except[date] || s.rule.AfterCompletion() {
		return date, true, nil
	}
	return s.rule.Bounded(b.End).NextFree(date, today, today, b.Taken-1, b.Except)
}

// movedDates are the series' due, deadline and start moved from its current
// occurrence date `from` to `to`, keeping the due's time and zone.
func movedDates(row Entity, from, to string) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	due := recurringDue{Date: to}
	if cur := decodeRecurringDue(row["due"]); cur != nil {
		due.Time, due.TZ = cur.Time, cur.TZ
	}
	out["due"] = JSONOf(due)
	if d := idValue(row["deadline"]); d != "" {
		out["deadline"] = JSONOf(recurrence.ShiftDate(d, from, to))
	}
	if st := idValue(row["start"]); st != "" && st != "someday" {
		out["start"] = JSONOf(recurrence.ShiftDate(st, from, to))
	}
	return out
}

// standOn is the series row as it stands on date (its dates moved there).
func (s seriesRow) standOn(date, today string) Entity {
	from := s.dueDate(today)
	if date == from {
		return s.row
	}
	out := Entity{}
	for k, v := range s.row {
		out[k] = v
	}
	for k, v := range movedDates(s.row, from, date) {
		out[k] = v
	}
	return out
}

// recordFields are the fields an occurrence record of date inherits from the
// series row (which stands on from), open. On an encrypted account (the
// series' title is ciphertext) no content field is copied: a ciphertext is bound
// to its entity id, so clients show the series' title until an unlocked device
// fills the record in (D12).
func recordFields(row Entity, id, from, date string, now int64) map[string]json.RawMessage {
	rec := map[string]json.RawMessage{
		"created_at":      JSONOf(now),
		"deleted_at":      json.RawMessage("null"),
		"recurrence":      json.RawMessage("null"),
		"series_id":       JSONOf(id),
		"occurrence_date": JSONOf(date),
		"completed_at":    json.RawMessage("null"),
		"skipped":         json.RawMessage("false"),
		"project_id":      json.RawMessage("null"),
	}
	encrypted := e2ee.IsCiphertextJSON(row["title"])
	for _, f := range []string{"title", "description", "project_id", "parent_id", "priority", "labels", "position", "estimate_minutes"} {
		if v, has := row[f]; has && !(encrypted && e2ee.IsContentField("task", f)) {
			rec[f] = v
		}
	}
	// Custom field values (custom-fields): every `fields.<id>`, null included.
	for f, v := range row {
		if _, ok := FieldValueID(f); ok {
			rec[f] = v
		}
	}
	// Only sent when set, like the client: the column (board-view), the part of
	// the day (day-parts D2), the energy (task-energy), the assignee and the place.
	for _, f := range []string{"section_id", "day_part", "energy", "assignee_id"} {
		if v := idValue(row[f]); v != "" {
			rec[f] = JSONOf(v)
		}
	}
	if loc := row["location"]; !IsNull(loc) && !encrypted {
		rec["location"] = loc
	}
	if string(row["evening"]) == "true" {
		rec["evening"] = json.RawMessage("true")
	}
	// A span keeps its flag; its start moved with the due below (multi-day-tasks D6).
	if string(row["span"]) == "true" {
		rec["span"] = json.RawMessage("true")
	}
	if idValue(row["start"]) == "someday" {
		rec["start"] = JSONOf("someday")
	}
	for k, v := range movedDates(row, from, date) {
		rec[k] = v
	}
	return rec
}

// OccurrenceAction is what PlanActOn does: "complete", "skip", "move" (Patch
// holds the new due) or "edit" (Patch holds the fields).
type OccurrenceAction struct {
	Kind  string
	Patch map[string]json.RawMessage
}

// ActPlan is the writes of acting on one occurrence.
type ActPlan struct {
	RecordID string
	// Existed is true when the record was there before.
	Existed bool
	// Record holds the record's fields to write (all of them for a new record).
	Record map[string]json.RawMessage
	// Series holds the series' fields to write (nil when it stays).
	Series map[string]json.RawMessage
	// Open reports a new open record (the series' relative reminders are copied, D7).
	Open bool
	// EndSeries reports that completing the current occurrence reached the end
	// condition: the series completes like a plain task and no record is written.
	EndSeries bool
}

// actionable reports whether date can be acted on: the current occurrence, a
// date with a record, or a projected date of a calendar rule within the budget.
func (s seriesRow) actionable(date, current string, tasks []Entity, today string) (bool, error) {
	if date < current {
		return false, nil
	}
	b := s.budget(tasks, current, today)
	if b.Own[date] || date == current {
		return true, nil
	}
	// Another piece's record, or a date of a completion-relative rule (series-split D3).
	if b.Except[date] || s.rule.AfterCompletion() {
		return false, nil
	}
	dates, _, err := s.rule.Bounded(b.End).OccurrencesExcept(current, today, b.Taken, date, date, b.Except)
	return len(dates) == 1, err
}

// PlanActOn plans acting on the occurrence of date (the current one when date
// is "") of the series id, whose stored row is row: complete, skip, move or edit
// it alone (web planActOn). On the current occurrence the series also moves to
// its next free date; on a later one only the record is written. An existing
// record is updated in place. ErrNotRecurring and ErrNotAnOccurrence report a
// request that cannot be done.
func PlanActOn(id string, row Entity, date string, action OccurrenceAction, tasks []Entity, now int64, today string) (ActPlan, error) {
	s, ok := openSeries(id, row)
	if !ok {
		return ActPlan{}, ErrNotRecurring
	}
	current, ok, err := s.current(tasks, today)
	if err != nil {
		return ActPlan{}, err
	}
	if !ok {
		return ActPlan{}, ErrNotAnOccurrence
	}
	if date == "" {
		date = current
	}
	if ok, err := s.actionable(date, current, tasks, today); err != nil || !ok {
		if err == nil {
			err = ErrNotAnOccurrence
		}
		return ActPlan{}, err
	}
	plan := ActPlan{RecordID: OccurrenceID(id, date)}
	state := actionFields(action, now)
	for _, r := range RecordsOf(id, tasks) {
		if r.ID == plan.RecordID {
			plan.Existed, plan.Record = true, state
			return plan, nil
		}
	}
	at := s.standOn(current, today)
	plan.Record = recordFields(at, id, current, date, now)
	for k, v := range state {
		plan.Record[k] = v
	}
	plan.Open = IsNull(plan.Record["completed_at"])
	if date != current {
		return plan, nil
	}
	b := s.budget(tasks, date, today)
	b.Except[date] = true
	taken := b.Taken
	if action.Kind == "skip" {
		taken = -1 // skips never count towards `for N times`
	}
	next, more, err := s.rule.Bounded(b.End).NextFree(date, today, today, taken, b.Except)
	if err != nil {
		return ActPlan{}, err
	}
	if !more {
		// The end condition: completing ends the series like a plain task;
		// anything else has no occurrence left to move the series to.
		if action.Kind == "complete" {
			return ActPlan{EndSeries: true}, nil
		}
		return ActPlan{}, ErrNotAnOccurrence
	}
	plan.Series = movedDates(at, date, next)
	// A plain series' skip of its current occurrence writes no record (D3).
	if action.Kind == "skip" && string(row["habit"]) != "true" {
		plan.Record, plan.RecordID, plan.Open = nil, "", false
	}
	return plan, nil
}

// actionFields are the fields an action writes on a record.
func actionFields(a OccurrenceAction, now int64) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	switch a.Kind {
	case "complete":
		out["completed_at"], out["skipped"] = JSONOf(now), json.RawMessage("false")
	case "skip":
		out["completed_at"], out["skipped"] = JSONOf(now), json.RawMessage("true")
	default:
		for k, v := range a.Patch {
			out[k] = v
		}
	}
	return out
}

// PlanRepair moves a series due on one of its exception dates to the next free
// occurrence (M5, D8; web planRepair); nil when nothing needs repair. When no
// free date remains the series completes at now. A piece of a split lineage
// whose stored until is later than its derived end, or missing, gets that end
// as its until, and one standing past it completes (series-split D3).
func PlanRepair(id string, row Entity, tasks []Entity, today string, now int64) (map[string]json.RawMessage, error) {
	s, ok := openSeries(id, row)
	due := decodeRecurringDue(row["due"])
	if !ok || s.rule.AfterCompletion() || due == nil {
		return nil, nil
	}
	b := s.budget(tasks, "", today)
	out := map[string]json.RawMessage{}
	if b.End != "" && (s.rule.Until() == "" || s.rule.Until() > b.End) {
		out["recurrence"] = JSONOf(s.rule.WithUntil(b.End).Canonical())
	}
	switch {
	case b.End != "" && due.Date > b.End:
		out["completed_at"] = JSONOf(now)
	case b.Except[due.Date]:
		next, ok, err := s.current(tasks, today)
		if err != nil {
			return nil, err
		}
		if !ok {
			out["completed_at"] = JSONOf(now)
			break
		}
		for k, v := range movedDates(row, due.Date, next) {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}
