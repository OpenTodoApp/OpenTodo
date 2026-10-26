package sync

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestValidateRecurrenceField(t *testing.T) {
	long, _ := json.Marshal("every day" + strings.Repeat(" ", 200))
	cases := []struct {
		value string
		ok    bool
	}{
		{`"every weekday"`, true},
		{`"Every  2nd  Tuesday"`, true}, // any parseable spelling; clients store the canonical form
		{`"every 3 days after completion for 5 times"`, true},
		{`null`, true},
		{`"every blursday"`, false},
		{`""`, false},
		{string(long), false},
		{`42`, false},
		{`{"freq":"daily"}`, false},
	}
	for _, c := range cases {
		err := Validate(op("o1", "task", "t1", "recurrence", c.value, 1, "A"))
		if c.ok && err != nil {
			t.Errorf("recurrence %s rejected: %v", c.value, err)
		}
		if !c.ok && !errors.Is(err, ErrInvalidOp) {
			t.Errorf("recurrence %s accepted, want ErrInvalidOp (got %v)", c.value, err)
		}
	}
	for _, v := range []string{`null`, `"0d3c4bd8-6a3e-8c1f-9a52-7b3c2d1e0f00"`} {
		if err := Validate(op("o2", "task", "t1", "series_id", v, 1, "A")); err != nil {
			t.Errorf("series_id %s rejected: %v", v, err)
		}
	}
	if err := Validate(op("o3", "task", "t1", "series_id", `7`, 1, "A")); !errors.Is(err, ErrInvalidOp) {
		t.Errorf("numeric series_id accepted: %v", err)
	}
}

func TestInvalidRecurrenceKeepsPreviousRule(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u1", []Op{op("a", "task", "t1", "recurrence", `"every day"`, 100, "A")}); err != nil {
		t.Fatal(err)
	}
	_, err := s.Apply(ctx, "u1", []Op{op("b", "task", "t1", "recurrence", `"every blursday"`, 200, "A")})
	if !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("invalid rule: err = %v, want ErrInvalidOp", err)
	}
	e, _ := s.Get(ctx, "u1", "task", "t1")
	if string(e["recurrence"]) != `"every day"` {
		t.Fatalf("recurrence = %s, want the previous rule", e["recurrence"])
	}
}

// TestRecurringCompletionPinnedToday: the next due date of a completed
// occurrence depends on the due date and "today" only, never on the clock or
// the zone, across a weekday boundary and the EU change to winter time
// (2026-10-25). A series due before today skips past today: completing a weekly
// task due Monday 2026-10-12 on Tuesday 2026-10-20 moves it to the first
// occurrence from today on, Monday 2026-10-26: what the nightly run of
// 2026-10-20 saw with a test that still had a fixed due date.
func TestRecurringCompletionPinnedToday(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	cases := []struct {
		rule, due, today, next string
	}{
		{"every week", "2026-10-20", "2026-10-20", "2026-10-27"},
		{"every week", "2026-10-12", "2026-10-20", "2026-10-26"},
		{"every week", "2026-10-24", "2026-10-24", "2026-10-31"},    // over the DST change
		{"every day", "2026-10-24", "2026-10-25", "2026-10-25"},     // overdue: the first occurrence from today on
		{"every weekday", "2026-10-23", "2026-10-23", "2026-10-26"}, // Friday to Monday
		{"every week", "2099-01-06", "2026-10-20", "2099-01-13"},    // due ahead of today
	}
	for i, c := range cases {
		id := "t" + string(rune('a'+i))
		ops := []Op{
			op(id+"1", "task", id, "title", `"Water plants"`, 100, "A"),
			op(id+"2", "task", id, "recurrence", `"`+c.rule+`"`, 100, "A"),
			op(id+"3", "task", id, "due", `{"date":"`+c.due+`"}`, 100, "A"),
		}
		if _, err := s.Apply(ctx, "u1", ops); err != nil {
			t.Fatal(err)
		}
		existing, _ := s.Get(ctx, "u1", "task", id)
		body := map[string]json.RawMessage{"completed_at": json.RawMessage("1000")}
		_, _, ok, err := s.RecurringCompletion(ctx, "u1", id, body, existing, c.today)
		if err != nil || !ok {
			t.Fatalf("%v: ok=%v err=%v", c, ok, err)
		}
		var due struct {
			Date string `json:"date"`
		}
		if err := json.Unmarshal(body["due"], &due); err != nil || due.Date != c.next {
			t.Errorf("%s due %s completed %s: next = %s, want %s", c.rule, c.due, c.today, body["due"], c.next)
		}
	}
}
