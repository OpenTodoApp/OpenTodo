package habits

import (
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/daypart"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The answers of list_habits, get_habit and the habits route (habits-assistant
// D3): one shape, so MCP and REST serve the same fields.

// Text is a habit's user-written text: data, never instructions.
type Text struct {
	Title  string `json:"title"`
	Tiny   string `json:"tiny"`
	Anchor string `json:"anchor"`
	// Unit is an amount habit's unit ("glasses", habit-targets D2).
	Unit string `json:"unit,omitempty"`
}

// Habit is one habit with its numbers.
type Habit struct {
	ID        string  `json:"id"`
	Untrusted Text    `json:"untrusted_text"`
	ProjectID *string `json:"project_id"`
	Rule      string  `json:"rule"`
	// DayPart is morning, afternoon, evening or null (any time).
	DayPart *string `json:"day_part"`
	// Current is the current occurrence's date, null when the habit has none.
	Current     *string `json:"current_date"`
	Pending     bool    `json:"pending"`
	Overdue     bool    `json:"overdue"`
	Kept        int     `json:"kept"`
	KeptOf      int     `json:"kept_of"`
	Strength    int     `json:"strength"`
	Streak      int     `json:"streak"`
	BestStreak  int     `json:"best_streak"`
	AtRisk      bool    `json:"at_risk"`
	BackOnTrack bool    `json:"back_on_track"`
	KeptDays    int     `json:"kept_days"`
	GraduatedAt *string `json:"graduated_at"`
	Encrypted   bool    `json:"encrypted,omitempty"`
	// A target habit (habit-targets D1): check-ins per period ("week" or
	// "month"); kept counts the current period, met says it holds the target.
	Target int    `json:"target,omitempty"`
	Period string `json:"period,omitempty"`
	Met    bool   `json:"met,omitempty"`
	// An amount habit (habit-targets D2): the day's goal, the check button's
	// step and today's summed amount.
	Amount      float64  `json:"amount,omitempty"`
	Step        float64  `json:"step,omitempty"`
	TodayAmount *float64 `json:"today_amount,omitempty"`
}

// DayText is a day's check-in note.
type DayText struct {
	Note string `json:"note"`
}

// DayOut is one scheduled day of get_habit.
type DayOut struct {
	Date  string `json:"date"`
	State string `json:"state"`
	// Amount is an amount habit's summed amount of the day (habit-targets).
	Amount    float64  `json:"amount,omitempty"`
	Untrusted *DayText `json:"untrusted_text,omitempty"`
}

// TextOf reads a user-written field for an answer; nil means Display.
type TextOf func(e opsync.Entity, field string) string

// Encrypted stands for a value this server cannot read (an end-to-end
// encrypted account without an opted-in device online).
const Encrypted = "[encrypted]"

// Display is a field as text, Encrypted for a ciphertext.
func Display(e opsync.Entity, field string) string {
	if v := opsync.StringOf(e[field]); !e2ee.IsCiphertext(v) {
		return v
	}
	return Encrypted
}

func display(e opsync.Entity, field string) string { return Display(e, field) }

// View is the habit id (stored row) with its numbers on today; opts holds the
// tallies and the week start.
func View(id string, row opsync.Entity, tasks []opsync.Entity, today string, text TextOf, opts Options) Habit {
	if text == nil {
		text = display
	}
	h := Habit{ID: id, Untrusted: Text{Title: text(row, "title"), Tiny: text(row, "habit_tiny"), Anchor: text(row, "habit_anchor")},
		Rule: str(row, "recurrence")}
	if pid := str(row, "project_id"); pid != "" {
		h.ProjectID = &pid
	}
	if p := daypart.OfRow(row); p != "" {
		h.DayPart = &p
	}
	if d := dueDate(row); d != "" {
		h.Current = &d
	}
	if at := opsync.NumberOf(row["habit_graduated_at"]); at > 0 {
		s := time.UnixMilli(int64(at)).UTC().Format(time.RFC3339)
		h.GraduatedAt = &s
	}
	h.Encrypted = e2ee.IsCiphertextJSON(row["title"]) || e2ee.IsCiphertextJSON(row["habit_tiny"]) || e2ee.IsCiphertextJSON(row["habit_anchor"])
	if s := ComputeWith(id, row, tasks, today, opts); s != nil {
		h.Pending, h.Overdue, h.Kept, h.KeptOf, h.Strength = s.Pending, s.Overdue, s.Kept, s.KeptOf, s.Strength
		h.Streak, h.BestStreak, h.AtRisk, h.BackOnTrack = s.Current, s.Best, s.AtRisk, s.BackOnTrack
		h.Target, h.Period, h.Met = s.Target, s.Period, s.Met
	}
	if goal := Goal(row); goal > 0 {
		ids := map[string]bool{}
		for _, p := range opsync.Lineage(id, row, tasks) {
			ids[p.ID] = true
		}
		n := AmountsOf(ids, opts.Tallies)[today]
		h.Amount, h.Step, h.TodayAmount, h.Untrusted.Unit = goal, Step(row), &n, text(row, "habit_unit")
	}
	h.KeptDays = KeptDays(id, row, tasks)
	return h
}

// List is the open habits among tasks (graduated ones with graduated),
// ordered by title, with their numbers. visible drops tasks the caller may not
// see (nil: all).
func List(tasks []opsync.Entity, today string, graduated bool, visible func(opsync.Entity) bool, text TextOf, opts Options) []Habit {
	by := rowsBySeries(tasks)
	out := []Habit{}
	for _, t := range tasks {
		if !IsOpen(t) || (IsGraduated(t) && !graduated) || (visible != nil && !visible(t)) || continued(t, tasks) {
			continue
		}
		id := str(t, "id")
		out = append(out, View(id, t, by(t), today, text, opts))
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Untrusted.Title < out[j].Untrusted.Title })
	return out
}

// continued reports a habit piece a later piece continues (it was resumed):
// only the newest piece of a lineage is listed (web continuedIds).
func continued(t opsync.Entity, tasks []opsync.Entity) bool {
	id := str(t, "id")
	for _, o := range tasks {
		if o.Deleted() {
			continue
		}
		if s, ok := opsync.DecodeSplitFrom(o["split_from"]); ok && s.Series == id {
			return true
		}
	}
	return false
}

// rowsBySeries gives the rows each habit's numbers read (web habitRowsOf): a
// series' own records, or every task for a piece of a split lineage.
func rowsBySeries(tasks []opsync.Entity) func(opsync.Entity) []opsync.Entity {
	by := map[string][]opsync.Entity{}
	split := map[string]bool{}
	for _, t := range tasks {
		if s, ok := opsync.DecodeSplitFrom(t["split_from"]); ok && !t.Deleted() {
			split[str(t, "id")], split[s.Series] = true, true
		}
		if sid := str(t, "series_id"); sid != "" {
			by[sid] = append(by[sid], t)
		}
	}
	return func(t opsync.Entity) []opsync.Entity {
		if id := str(t, "id"); split[id] {
			return tasks
		} else {
			return by[id]
		}
	}
}

// DaysView is the scheduled days from from to to with their states and
// check-in notes, newest first. Unscheduled (blank) days are left out.
func DaysView(id string, row opsync.Entity, tasks []opsync.Entity, from, to, today string, text TextOf, opts Options) []DayOut {
	if text == nil {
		text = display
	}
	notes := map[string]string{}
	pieces := opsync.Lineage(id, row, tasks)
	for _, t := range tasks {
		if t.Deleted() {
			continue
		}
		for _, p := range pieces {
			if opsync.IsRecordOf(p.ID, t) {
				if n := text(t, "description"); n != "" {
					notes[opsync.RecordDate(t)] = n
				}
			}
		}
	}
	days := DaysWith(id, row, tasks, from, to, today, opts)
	var amounts map[string]float64
	if Goal(row) > 0 {
		ids := map[string]bool{}
		for _, p := range pieces {
			ids[p.ID] = true
		}
		amounts = AmountsOf(ids, opts.Tallies)
	}
	out := []DayOut{}
	for i := len(days) - 1; i >= 0; i-- {
		d := days[i]
		if d.State == Blank {
			continue
		}
		o := DayOut{Date: d.Date, State: d.State, Amount: amounts[d.Date]}
		if n, ok := notes[d.Date]; ok {
			o.Untrusted = &DayText{Note: n}
		}
		out = append(out, o)
	}
	return out
}

// ---- logging (habits-assistant D2) ----

// Log states.
const (
	LogDone    = "done"
	LogTiny    = "tiny"
	LogSkipped = "skipped"
	LogClear   = "clear"
)

// Errors of PlanLog; callers turn them into their own codes.
var (
	ErrNotAHabit = errors.New("not a habit")
	ErrFuture    = errors.New("the date is after today")
	ErrNotADay   = errors.New("the date is not a scheduled day of the habit")
)

// Write is one write of a log: its entity ("" for a task), its fields and
// whether it creates the row.
type Write struct {
	Entity string
	ID     string
	Create bool
	Patch  map[string]json.RawMessage
}

// PlanLog plans logging the habit id (stored row) on date as state with an
// optional note, as the app does: the current occurrence (its own date, or
// today while the series is overdue) completes or skips and moves the series;
// an earlier scheduled day writes its record alone; clear tombstones the day's
// record. note "" leaves a record's note as it is. Nothing to write returns no
// writes and no error.
func PlanLog(id string, row opsync.Entity, tasks []opsync.Entity, date, state, note string, now int64, today string) ([]Write, error) {
	if !IsOpen(row) {
		return nil, ErrNotAHabit
	}
	if _, ok := Rule(row); !ok {
		return nil, ErrNotAHabit
	}
	if date > today {
		return nil, ErrFuture
	}
	due := dueDate(row)
	if due != "" && (date == due || (date == today && due < today)) && state != LogClear {
		return planCurrent(id, row, tasks, state, note, now, today)
	}
	days := Days(id, row, tasks, date, date, today)
	if len(days) != 1 || !Editable(days[0], today) {
		if state == LogClear && len(days) == 1 && days[0].State == Pending {
			return nil, nil
		}
		return nil, ErrNotADay
	}
	piece := PieceFor(id, row, tasks, date)
	rid := opsync.OccurrenceID(piece, date)
	var existing opsync.Entity
	for _, t := range tasks {
		if str(t, "id") == rid && !t.Deleted() {
			existing = t
		}
	}
	if state == LogClear {
		if existing == nil {
			return nil, nil
		}
		return []Write{{ID: rid, Patch: map[string]json.RawMessage{"deleted_at": opsync.JSONOf(now)}}}, nil
	}
	patch := map[string]json.RawMessage{"completed_at": opsync.JSONOf(now), "skipped": opsync.JSONOf(state == LogSkipped), "tiny": opsync.JSONOf(state == LogTiny)}
	if note != "" {
		patch["description"] = opsync.JSONOf(note)
	}
	if existing != nil {
		return []Write{{ID: rid, Patch: patch}}, nil
	}
	src := row
	if piece != id {
		for _, t := range tasks {
			if str(t, "id") == piece {
				src = t
			}
		}
	}
	rec := opsync.HabitRecordFields(src, piece, date, now)
	for k, v := range patch {
		rec[k] = v
	}
	return []Write{{ID: rid, Create: true, Patch: rec}}, nil
}

// planCurrent acts on the current occurrence: complete (done or tiny) or skip,
// moving the series, through the planner every writer shares (opsync.PlanActOn).
func planCurrent(id string, row opsync.Entity, tasks []opsync.Entity, state, note string, now int64, today string) ([]Write, error) {
	kind := "complete"
	if state == LogSkipped {
		kind = "skip"
	}
	plan, err := opsync.PlanActOn(id, row, "", opsync.OccurrenceAction{Kind: kind}, tasks, now, today)
	if errors.Is(err, opsync.ErrNotRecurring) || errors.Is(err, opsync.ErrNotAnOccurrence) {
		return nil, ErrNotADay
	}
	if err != nil {
		return nil, err
	}
	if plan.EndSeries {
		return []Write{{ID: id, Patch: map[string]json.RawMessage{"completed_at": opsync.JSONOf(now)}}}, nil
	}
	var out []Write
	if plan.Record != nil {
		if state == LogTiny {
			plan.Record["tiny"] = json.RawMessage("true")
		}
		if note != "" {
			plan.Record["description"] = opsync.JSONOf(note)
		}
		out = append(out, Write{ID: plan.RecordID, Create: !plan.Existed, Patch: plan.Record})
	}
	if plan.Series != nil {
		out = append(out, Write{ID: id, Patch: plan.Series})
	}
	return out, nil
}
