package sync

import (
	"encoding/json"
	"errors"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

// "This and following" (OpenSpec change series-split, design D1): the server's
// port of web/src/lib/seriesSplit.ts planSplit, pinned with it by
// web/src/lib/series.fixture.json. The REST split route writes the plan
// through ApplyStrict.

// ErrInvalidSplitChange: the changes of a split set a rule that cannot repeat
// from the split (none, unparseable or completion-relative).
var ErrInvalidSplitChange = errors.New("a piece needs a calendar rule")

// SplitPlan is the writes of a split.
type SplitPlan struct {
	PieceID string
	// First is the piece's first occurrence date.
	First string
	// Series holds the series' fields (its rule ending the day before).
	Series map[string]json.RawMessage
	// Piece holds every field of the new series.
	Piece map[string]json.RawMessage
	// Carries holds, by record id, the change carried to the series' open
	// records from the split date on that still hold the previous value.
	Carries map[string]map[string]json.RawMessage
}

// carriedFields are the fields an edit carries to untouched open records
// (series-exceptions D6; web CARRIED_FIELDS).
var carriedFields = []string{"title", "priority", "labels", "project_id", "section_id", "estimate_minutes", "assignee_id", "location"}

// PlanSplit plans splitting the series id (stored row row) from date with the
// task fields of patch applied from there on. ErrNotRecurring, ErrNotAnOccurrence
// (not an occurrence after the current one, or a completion-relative rule) and
// ErrInvalidSplitChange report a request that cannot be done.
func PlanSplit(id string, row Entity, date string, patch map[string]json.RawMessage, tasks []Entity, now int64, today string) (SplitPlan, error) {
	s, ok := openSeries(id, row)
	if !ok || decodeRecurringDue(row["due"]) == nil {
		return SplitPlan{}, ErrNotRecurring
	}
	if s.rule.AfterCompletion() {
		return SplitPlan{}, ErrNotAnOccurrence
	}
	current, ok, err := s.current(tasks, today)
	if err != nil {
		return SplitPlan{}, err
	}
	if !ok || date <= current {
		return SplitPlan{}, ErrNotAnOccurrence
	}
	if ok, err := s.actionable(date, current, tasks, today); err != nil || !ok {
		if err == nil {
			err = ErrNotAnOccurrence
		}
		return SplitPlan{}, err
	}
	text := StringOf(row["recurrence"])
	if raw, has := patch["recurrence"]; has {
		text = StringOf(raw)
	}
	own, err := recurrence.Parse(text)
	if err != nil || own.AfterCompletion() {
		return SplitPlan{}, ErrInvalidSplitChange
	}
	first, err := s.pieceStart(own, date, tasks, today)
	if err != nil {
		return SplitPlan{}, err
	}
	plan := SplitPlan{PieceID: PieceID(id, date), First: first}
	plan.Series = map[string]json.RawMessage{"recurrence": JSONOf(s.rule.WithUntil(recurrence.AddDays(date, -1)).Canonical())}
	piece := recordFields(row, id, s.dueDate(today), first, now)
	delete(piece, "occurrence_date")
	for k, v := range patch {
		if k != "due" && k != "recurrence" {
			piece[k] = v
		}
	}
	piece["due"] = pieceDue(row["due"], patch["due"], first)
	piece["recurrence"] = JSONOf(own.Canonical())
	piece["series_id"] = json.RawMessage("null")
	piece["split_from"] = JSONOf(SplitFrom{Series: id, Date: date})
	piece["created_at"], piece["completed_at"], piece["deleted_at"] = JSONOf(now), json.RawMessage("null"), json.RawMessage("null")
	if string(row["habit"]) == "true" {
		piece["habit"] = json.RawMessage("true")
	}
	plan.Piece = piece
	plan.Carries = carryFrom(id, row, patch, tasks, date)
	return plan, nil
}

// pieceStart is the first occurrence of the piece's rule on or after date
// that is not an exception of the lineage.
func (s seriesRow) pieceStart(own recurrence.Rule, date string, tasks []Entity, today string) (string, error) {
	first, err := own.First(date)
	if err != nil {
		return "", err
	}
	if b := s.budget(tasks, "", today); b.Except[first] {
		next, ok, err := own.NextFree(first, today, today, -1, b.Except)
		if err != nil {
			return "", err
		}
		if !ok {
			return "", ErrNotAnOccurrence
		}
		first = next
	}
	if u := own.Until(); u != "" && first > u {
		return "", ErrNotAnOccurrence
	}
	return first, nil
}

// pieceDue is the piece's due on date: at the change's time and zone when it
// sets a due, else the series'.
func pieceDue(series, change json.RawMessage, date string) json.RawMessage {
	from := decodeRecurringDue(change)
	if from == nil {
		from = decodeRecurringDue(series)
	}
	due := recurringDue{Date: date}
	if from != nil && from.Time != nil {
		due.Time, due.TZ = from.Time, from.TZ
	}
	return JSONOf(due)
}

// carryFrom carries patch to the open records of the series dated on or after
// from whose value still equals the series' (web planCarry with from): the
// carried fields, and a new time of day on records still at the old one.
func carryFrom(id string, row Entity, patch map[string]json.RawMessage, tasks []Entity, from string) map[string]map[string]json.RawMessage {
	out := map[string]map[string]json.RawMessage{}
	same := func(a, b json.RawMessage) bool { return canonicalJSON(a) == canonicalJSON(b) }
	newDue, oldDue := decodeRecurringDue(patch["due"]), decodeRecurringDue(row["due"])
	for _, r := range RecordsOf(id, tasks) {
		if r.State != RecordOpen || r.Date < from {
			continue
		}
		carry := map[string]json.RawMessage{}
		for _, f := range carriedFields {
			if v, has := patch[f]; has && !same(v, row[f]) && same(r.Task[f], row[f]) {
				carry[f] = v
			}
		}
		recDue := decodeRecurringDue(r.Task["due"])
		if newDue != nil && oldDue != nil && recDue != nil && (strOf(newDue.Time) != strOf(oldDue.Time) || strOf(newDue.TZ) != strOf(oldDue.TZ)) &&
			strOf(recDue.Time) == strOf(oldDue.Time) && strOf(recDue.TZ) == strOf(oldDue.TZ) {
			d := recurringDue{Date: recDue.Date}
			if newDue.Time != nil {
				d.Time, d.TZ = newDue.Time, newDue.TZ
			}
			carry["due"] = JSONOf(d)
		}
		if len(carry) > 0 {
			out[r.ID] = carry
		}
	}
	return out
}

func strOf(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// canonicalJSON is v re-encoded so equal values compare equal (null for absent).
func canonicalJSON(v json.RawMessage) string {
	if IsNull(v) {
		return "null"
	}
	var x any
	if json.Unmarshal(v, &x) != nil {
		return string(v)
	}
	return string(JSONOf(x))
}
