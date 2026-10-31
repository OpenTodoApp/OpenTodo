package davroutes

import (
	"encoding/json"
	"sort"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Exceptions of repeating tasks over CalDAV (OpenSpec change series-exceptions,
// design D10). A series is served with EXDATE for each exception date from its
// current occurrence on and a `for N times` rule with the UNTIL of its last
// remaining occurrence; an open occurrence record is its own VTODO linked to
// the series. A client's EXDATE and RECURRENCE-ID overrides become the matching
// occurrence records through opsync.PlanActOn, as in the app, and are never
// stored: the next fetch serves the series with the EXDATE and the record as
// its own object.

// seriesRows are the live tasks pointing at a series (records among them).
func (v *davView) seriesRows(id string) []opsync.Entity {
	if v.bySeries == nil {
		v.bySeries = map[string][]opsync.Entity{}
		for _, t := range v.tasks {
			if sid := idOf(t["series_id"]); sid != "" {
				v.bySeries[sid] = append(v.bySeries[sid], t)
			}
		}
	}
	return v.bySeries[id]
}

// seriesParts fills the exception dates, the UNTIL of a counted rule and the
// sibling link of a task being served.
func (v *davView) seriesParts(t opsync.Entity, ct *caldav.Task) {
	id := idOf(t["id"])
	if sid := idOf(t["series_id"]); sid != "" && isNullish(t["completed_at"]) && opsync.IsRecordOf(sid, t) {
		if _, ok := v.byID[sid]; ok {
			ct.SiblingUID = v.uidOf(sid)
		}
	}
	if ct.Recurrence == "" || ct.Due == nil || !isNullish(t["completed_at"]) {
		return
	}
	rule, err := recurrence.Parse(ct.Recurrence)
	if err != nil || rule.AfterCompletion() {
		return
	}
	b := opsync.SeriesBudget(id, v.seriesRows(id), ct.Due.Date)
	for d := range b.Except {
		if d >= ct.Due.Date {
			ct.ExDates = append(ct.ExDates, d)
		}
	}
	sort.Strings(ct.ExDates)
	if rule.Count() > 0 {
		ct.Until = lastOccurrence(rule, ct.Due.Date, v.today, b)
	}
}

// lastOccurrence is the date of a counted series' last remaining occurrence:
// the current one when no projection is left.
func lastOccurrence(rule recurrence.Rule, due, today string, b opsync.Budget) string {
	// The walk of the projections (recurrence.OccurrencesExcept), to its end:
	// each step uses up one occurrence, exception dates none.
	last := due
	for k := 0; k < rule.Count(); k++ {
		next, ok, err := rule.NextFree(last, today, today, b.Taken+k, b.Except)
		if err != nil || !ok || next <= last {
			break
		}
		last = next
	}
	return last
}

// servedRRULE is the RRULE value cur is served with ("" without a rule).
func (v *davView) servedRRULE(cur opsync.Entity) string {
	text := idOf(cur["recurrence"])
	rule, err := recurrence.Parse(text)
	if text == "" || err != nil {
		return ""
	}
	ct := caldav.Task{Recurrence: text}
	if d := decodeDue(cur["due"]); d != nil {
		ct.Due = &caldav.Due{Date: d.Date, Time: d.Time, TZ: d.TZ}
	}
	v.seriesParts(cur, &ct)
	return rule.RRULEUntil(ct.Until)
}

// occurrenceOps turns the client's overrides and EXDATE changes on a series
// object into occurrence records. A completed override of the current
// occurrence is left to the series' completion (update); series fields a plan
// moves (a skipped current occurrence) are added to body unless it sets them.
func (d *davRequest) occurrenceOps(v *davView, cur opsync.Entity, in *caldav.Inbound, body map[string]json.RawMessage, ts int64) []opsync.Op {
	id := idOf(cur["id"])
	cd := decodeDue(cur["due"])
	if idOf(cur["recurrence"]) == "" || !isNullish(cur["completed_at"]) || cd == nil || in.Rule == "" {
		return nil
	}
	now, today := d.s.now().UnixMilli(), localToday(d.s.now())
	tasks := v.tasks
	records := map[string]opsync.OccurrenceRecord{}
	for _, r := range opsync.RecordsOf(id, v.seriesRows(id)) {
		records[r.Date] = r
	}
	var ops []opsync.Op
	act := func(date string, a opsync.OccurrenceAction) {
		plan, err := opsync.PlanActOn(id, cur, date, a, tasks, now, today)
		if err != nil || plan.EndSeries {
			return
		}
		for f, val := range plan.Record {
			ops = append(ops, d.op("task", plan.RecordID, f, val, ts))
		}
		for f, val := range plan.Series {
			if _, set := body[f]; !set {
				body[f] = val
			}
		}
	}
	overridden := map[string]bool{}
	for _, o := range in.Overrides {
		overridden[o.Date] = true
		rec, has := records[o.Date]
		switch {
		case o.Completed && o.Date == cd.Date && !has:
			// The series' completion (update) records it and moves on.
		case o.Completed:
			if !has || rec.State != opsync.RecordDone {
				act(o.Date, opsync.OccurrenceAction{Kind: "complete"})
			}
		case o.Cancelled:
			if !has || rec.State != opsync.RecordSkipped {
				act(o.Date, opsync.OccurrenceAction{Kind: "skip"})
			}
		default:
			if patch := overridePatch(o, cur, rec, has); len(patch) > 0 {
				act(o.Date, opsync.OccurrenceAction{Kind: "edit", Patch: patch})
			}
		}
	}
	sent := map[string]bool{}
	for _, date := range in.ExDates {
		sent[date] = true
		if _, has := records[date]; !has && !overridden[date] && date >= cd.Date {
			act(date, opsync.OccurrenceAction{Kind: "skip"})
		}
	}
	// A date taken out of EXDATE turns its skipped record into an open
	// occurrence again; only a client that sends EXDATE at all can remove one.
	if in.HasExDate {
		for date, rec := range records {
			if rec.State == opsync.RecordSkipped && date >= cd.Date && !sent[date] && !overridden[date] {
				ops = append(ops, d.op("task", rec.ID, "completed_at", json.RawMessage("null"), ts), d.op("task", rec.ID, "skipped", json.RawMessage("false"), ts))
			}
		}
	}
	return ops
}

// overridePatch is what a changed override writes on its occurrence: a new
// due, title or priority compared with the record (or the series on that date).
func overridePatch(o caldav.Override, cur opsync.Entity, rec opsync.OccurrenceRecord, has bool) map[string]json.RawMessage {
	base := cur
	if has {
		base = rec.Task
	}
	patch := map[string]json.RawMessage{}
	if o.Due != nil {
		was := decodeDue(base["due"])
		if !has && was != nil {
			was.Date = o.Date // the series on that date
		}
		moved := due{Date: o.Due.Date, Time: o.Due.Time, TZ: o.Due.TZ}
		if was == nil || !opsync.SameJSON(mustJSON(moved), mustJSON(*was)) {
			patch["due"] = mustJSON(moved)
		}
	}
	if o.Title != nil && *o.Title != idOf(base["title"]) {
		patch["title"] = mustJSON(*o.Title)
	}
	if o.Priority != 0 && o.Priority != int(numberOf(base["priority"])) {
		patch["priority"] = mustJSON(o.Priority)
	}
	return patch
}
