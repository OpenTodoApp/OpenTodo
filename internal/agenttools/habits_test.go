package agenttools

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/habits"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The habit tools (OpenSpec change habits-assistant, mcp-server "Habit
// tools"). The fixture's today is 2026-10-12.

// habitFixture holds Run (every day, due today) done on the 8th, 10th (with a
// note) and 11th, missed on the 9th, and Read (every day, new today).
func habitFixture(t *testing.T) *fixture {
	f := newFixture(t)
	f.task("u1", "run", "Run", map[string]any{"recurrence": "every day", "habit": true, "due": map[string]any{"date": "2026-10-12"}, "habit_tiny": "Shoes on"})
	for _, d := range []string{"2026-10-08", "2026-10-10", "2026-10-11"} {
		fields := map[string]any{"series_id": "run", "occurrence_date": d, "due": map[string]any{"date": d}, "completed_at": 1, "title": "Run"}
		if d == "2026-10-10" {
			fields["description"] = "5k, knee sore"
		}
		f.task("u1", opsync.OccurrenceID("run", d), "Run", fields)
	}
	f.task("u1", "read", "Read", map[string]any{"recurrence": "every day", "habit": true, "due": map[string]any{"date": "2026-10-12"}})
	f.task("u1", "plain", "Water plants", map[string]any{"recurrence": "every day", "due": map[string]any{"date": "2026-10-12"}})
	return f
}

func TestHowIsRunningGoing(t *testing.T) {
	f := habitFixture(t)
	out := f.mustCall(agent("u1"), "get_habit", map[string]any{"id": "run"})
	h := out["habit"].(habits.Habit)
	tasks, _ := f.sync.List(t.Context(), "u1", "task", false)
	want := habits.Compute("run", f.get("u1", "run"), tasks, "2026-10-12")
	if h.Kept != want.Kept || h.Strength != want.Strength || h.Streak != 2 || h.BestStreak != want.Best || h.Untrusted.Title != "Run" || h.Untrusted.Tiny != "Shoes on" {
		t.Fatalf("habit = %+v, want %+v", h, *want)
	}
	days := out["days"].([]habits.DayOut)
	if len(days) != 5 || days[0].Date != "2026-10-12" || days[0].State != habits.Pending || days[2].Untrusted == nil || days[2].Untrusted.Note != "5k, knee sore" || days[3].State != habits.Missed {
		t.Fatalf("days = %+v", days)
	}
	if out["server_time"] == "" || out["_notice"] != Notice {
		t.Fatalf("out = %v", out)
	}
	list := f.mustCall(agent("u1"), "list_habits", nil)["habits"].([]habits.Habit)
	if len(list) != 2 || list[0].ID != "read" || list[1].ID != "run" {
		t.Fatalf("list = %+v", list)
	}
	if _, err := f.call(agent("u1"), "get_habit", map[string]any{"id": "run", "from": "2025-01-01", "to": "2026-10-12"}); !isArgErr(err) {
		t.Fatalf("a range over 400 days = %v", err)
	}
}

func TestLogYesterday(t *testing.T) {
	f := habitFixture(t)
	id := opsync.OccurrenceID("run", "2026-10-09")
	f.mustCall(agent("u1"), "log_habit", map[string]any{"id": "run", "date": "2026-10-09", "state": "done", "note": "5k"})
	rec := f.get("u1", id)
	if rec == nil || opsync.IsNull(rec["completed_at"]) || opsync.StringOf(rec["description"]) != "5k" || string(rec["skipped"]) == "true" || opsync.StringOf(rec["series_id"]) != "run" {
		t.Fatalf("record = %v", rec)
	}
	if s := f.get("u1", "run"); string(s["due"]) != `{"date":"2026-10-12"}` {
		t.Fatalf("series moved: %s", s["due"])
	}
	// Tiny, then clear: the same record, then a tombstone.
	f.mustCall(agent("u1"), "log_habit", map[string]any{"id": "run", "date": "2026-10-09", "state": "tiny"})
	if rec := f.get("u1", id); string(rec["tiny"]) != "true" || opsync.StringOf(rec["description"]) != "5k" {
		t.Fatalf("tiny record = %v", rec)
	}
	f.mustCall(agent("u1"), "log_habit", map[string]any{"id": "run", "date": "2026-10-09", "state": "clear"})
	if rec := f.get("u1", id); rec != nil && !rec.Deleted() {
		t.Fatalf("cleared record = %v", rec)
	}
	// A new habit has no history before today: yesterday reads as blank.
	if _, err := f.call(agent("u1"), "log_habit", map[string]any{"id": "read", "date": "2026-10-11", "state": "done"}); toolCode(err) != "invalid_input" {
		t.Fatalf("before the first day = %v", err)
	}
}

func TestSkipToday(t *testing.T) {
	f := habitFixture(t)
	out := f.mustCall(agent("u1"), "log_habit", map[string]any{"id": "read", "state": "skipped"})
	if out["changed"] != 1 {
		t.Fatalf("out = %v", out)
	}
	rec := f.get("u1", opsync.OccurrenceID("read", "2026-10-12"))
	if rec == nil || string(rec["skipped"]) != "true" || opsync.IsNull(rec["completed_at"]) {
		t.Fatalf("record = %v", rec)
	}
	if s := f.get("u1", "read"); string(s["due"]) != `{"date":"2026-10-13"}` {
		t.Fatalf("series due = %s", s["due"])
	}
	// The same day logged done afterwards writes the record in place.
	f.mustCall(agent("u1"), "log_habit", map[string]any{"id": "read", "state": "done", "note": "after all"})
	if rec := f.get("u1", opsync.OccurrenceID("read", "2026-10-12")); string(rec["skipped"]) != "false" || opsync.StringOf(rec["description"]) != "after all" {
		t.Fatalf("record = %v", rec)
	}
	if s := f.get("u1", "read"); string(s["due"]) != `{"date":"2026-10-13"}` {
		t.Fatalf("series moved twice: %s", s["due"])
	}
}

func TestLogHabitRefusals(t *testing.T) {
	f := habitFixture(t)
	before := f.opsOn("task")
	_, err := f.call(agent("u1"), "log_habit", map[string]any{"id": "read", "date": "2026-10-13", "state": "done"})
	if toolCode(err) != "invalid_input" || !strings.Contains(err.Error(), "date") {
		t.Fatalf("a future day = %v", err)
	}
	if _, err := f.call(agent("u1"), "log_habit", map[string]any{"id": "plain", "state": "done"}); toolCode(err) != "not_a_habit" {
		t.Fatalf("a plain task = %v", err)
	}
	if _, err := f.call(agent("u1"), "log_habit", map[string]any{"id": "read", "state": "maybe"}); !isArgErr(err) {
		t.Fatalf("a bad state = %v", err)
	}
	if _, err := f.call(agent("u1"), "log_habit", map[string]any{"id": "nope", "state": "done"}); toolCode(err) != "not_found" {
		t.Fatalf("an unknown id = %v", err)
	}
	// Before the habit's first day (its first record or the current one).
	if _, err := f.call(agent("u1"), "log_habit", map[string]any{"id": "run", "date": "2026-09-01", "state": "done"}); toolCode(err) != "invalid_input" {
		t.Fatalf("before the first day = %v", err)
	}
	off := agent("u1")
	off.UserAllowsWrites = false
	read := Caller{UserID: "u1", Scope: "read", OwnerAllowsWrites: true, UserAllowsWrites: true}
	for _, c := range []Caller{off, read} {
		if _, err := f.call(c, "log_habit", map[string]any{"id": "read", "state": "done"}); err == nil {
			t.Fatalf("%+v logged a habit", c)
		}
		for _, d := range f.reg.Definitions(c) {
			if d.Name == "log_habit" {
				t.Fatalf("%+v lists log_habit", c)
			}
		}
	}
	if got := f.opsOn("task"); got != before {
		t.Fatalf("ops %d → %d", before, got)
	}
	names := map[string]Kind{}
	for _, d := range f.reg.Definitions(read) {
		names[d.Name] = d.Kind
	}
	if names["list_habits"] != KindRead || names["get_habit"] != KindRead {
		t.Fatalf("read token tools = %v", names)
	}
}

// A tool's log and a device's tick of the same day converge on one record.
func TestLogHabitConvergesWithDevice(t *testing.T) {
	f := habitFixture(t)
	id := opsync.OccurrenceID("read", "2026-10-11")
	f.task("u1", id, "Read", map[string]any{"series_id": "read", "occurrence_date": "2026-10-11", "due": map[string]any{"date": "2026-10-11"}, "completed_at": 5, "skipped": true})
	f.mustCall(agent("u1"), "log_habit", map[string]any{"id": "read", "date": "2026-10-11", "state": "done"})
	tasks, _ := f.sync.List(t.Context(), "u1", "task", false)
	n := 0
	for _, x := range tasks {
		if opsync.IsRecordOf("read", x) && opsync.RecordDate(x) == "2026-10-11" {
			n++
			if string(x["skipped"]) != "false" {
				t.Fatalf("record = %v", x)
			}
		}
	}
	if n != 1 {
		t.Fatalf("%d records of the day", n)
	}
}

func TestHabitFieldsInWrites(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	out := f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Read", "recurrence": "every day", "habit": true, "habit_tiny": "One page", "habit_anchor": "After dinner", "day_part": "evening"}}})
	id := out["results"].([]map[string]any)[0]["id"].(string)
	got := f.get("u1", id)
	if string(got["habit"]) != "true" || opsync.StringOf(got["habit_tiny"]) != "One page" || opsync.StringOf(got["habit_anchor"]) != "After dinner" || string(got["due"]) != `{"date":"2026-10-12"}` {
		t.Fatalf("habit = %v", got)
	}
	if _, err := f.call(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Read", "habit": true}}}); !isArgErr(err) {
		t.Fatalf("a habit without a rule = %v", err)
	}
	f.task("u1", "t1", "Stretch", map[string]any{"recurrence": "every mon, wed"})
	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "habit": true, "habit_tiny": "One stretch"}}})
	if got := f.get("u1", "t1"); string(got["habit"]) != "true" || string(got["due"]) != `{"date":"2026-10-12"}` {
		t.Fatalf("made habit = %v", got)
	}
}

func TestEncryptedHabit(t *testing.T) {
	f := newFixture(t)
	env := "enc:v1:" + strings.Repeat("A", 40)
	f.task("u1", "h", env, map[string]any{"recurrence": "every day", "habit": true, "due": map[string]any{"date": "2026-10-12"}})
	f.task("u1", opsync.OccurrenceID("h", "2026-10-11"), env, map[string]any{"series_id": "h", "occurrence_date": "2026-10-11", "due": map[string]any{"date": "2026-10-11"}, "completed_at": 1, "description": env})
	c := agent("u1")
	c.Encrypted = true
	out := f.mustCall(c, "get_habit", map[string]any{"id": "h"})
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), "enc:v1:") {
		t.Fatalf("ciphertext in %s", raw)
	}
	h := out["habit"].(habits.Habit)
	days := out["days"].([]habits.DayOut)
	if h.Untrusted.Title != habits.Encrypted || h.Streak != 1 || days[1].State != habits.Done || days[1].Untrusted.Note != habits.Encrypted {
		t.Fatalf("habit = %+v days = %+v", h, days)
	}
}

// Targets and amounts in create_tasks, update_tasks and log_habit (OpenSpec
// change habit-targets, tasks 4.1, 4.2).
func TestHabitTargetsAndAmounts(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	out := f.mustCall(c, "create_tasks", map[string]any{"items": []any{
		map[string]any{"title": "Gym", "recurrence": "every mon", "habit": true, "habit_target": 3, "habit_period": "week"},
		map[string]any{"title": "Water", "recurrence": "every day", "habit": true, "habit_amount": 8, "habit_unit": "glasses"},
	}})
	res := out["results"].([]map[string]any)
	gym, water := res[0]["id"].(string), res[1]["id"].(string)
	if g := f.get("u1", gym); string(g["habit_target"]) != "3" || opsync.StringOf(g["habit_period"]) != "week" || opsync.StringOf(g["recurrence"]) != "every day" {
		t.Fatalf("gym = %v", g)
	}
	if _, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": gym, "habit_target": 4}}}); !isArgErr(err) {
		t.Fatalf("a target without its period = %v", err)
	}
	// Two log_habit amounts add to the agent's own tally; the day is partial.
	for range 2 {
		f.mustCall(c, "log_habit", map[string]any{"id": water, "amount": 3})
	}
	h := f.mustCall(c, "get_habit", map[string]any{"id": water})
	if hb := h["habit"].(habits.Habit); hb.Amount != 8 || hb.TodayAmount == nil || *hb.TodayAmount != 6 || hb.Untrusted.Unit != "glasses" {
		t.Fatalf("water = %+v", hb)
	}
	if d := h["days"].([]habits.DayOut)[0]; d.State != habits.Partial || d.Amount != 6 {
		t.Fatalf("today = %+v", d)
	}
	tallies, _ := f.sync.List(t.Context(), "u1", "habit_tally", false)
	if len(tallies) != 1 {
		t.Fatalf("tallies = %v", tallies)
	}
	// Amount on a plain habit: invalid_input naming amount.
	if _, err := f.call(c, "log_habit", map[string]any{"id": gym, "amount": 1}); err == nil || !strings.Contains(err.Error(), "amount") {
		t.Fatalf("amount on a target habit = %v", err)
	}
	g := f.mustCall(c, "get_habit", map[string]any{"id": gym})["habit"].(habits.Habit)
	if g.Target != 3 || g.Period != "week" || g.KeptOf != 3 {
		t.Fatalf("gym numbers = %+v", g)
	}
}
