package sync

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

// TestValidateHabitFields (OpenSpec change habits, design D1): habit and
// skipped are booleans; anything else is rejected.
func TestValidateHabitFields(t *testing.T) {
	for _, f := range []string{"habit", "skipped"} {
		for _, c := range []struct {
			value string
			ok    bool
		}{{`true`, true}, {`false`, true}, {`"yes"`, false}, {`null`, false}, {`1`, false}} {
			err := Validate(op("1", "task", "t1", f, c.value, 1, "A"))
			if c.ok && err != nil {
				t.Errorf("%s %s rejected: %v", f, c.value, err)
			}
			if !c.ok && !errors.Is(err, ErrInvalidOp) {
				t.Errorf("%s %s accepted, want ErrInvalidOp (got %v)", f, c.value, err)
			}
		}
	}
}

// An older build that knows nothing of habits edits the title: per-field LWW
// keeps the flag.
func TestHabitSurvivesOlderClientEdit(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u1", []Op{
		op("a", "task", "t1", "title", `"Meditate"`, 100, "A"),
		op("b", "task", "t1", "habit", `true`, 100, "A"),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Apply(ctx, "u1", []Op{op("c", "task", "t1", "title", `"Meditate 10 min"`, 200, "old")}); err != nil {
		t.Fatal(err)
	}
	e, err := s.Get(ctx, "u1", "task", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if string(e["habit"]) != `true` || string(e["title"]) != `"Meditate 10 min"` {
		t.Fatalf("habit = %s, title = %s", e["habit"], e["title"])
	}
}

// A `for 2 times` habit with one skipped record and one completion is
// completed: the skipped record does not count, so the series still rolls
// forward (habits D2, recurring-tasks "End conditions").
func TestRecurringCompletionIgnoresSkippedRecords(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	series := "s1"
	skipped := OccurrenceID(series, "2026-10-12")
	ops := []Op{
		op("s-1", "task", series, "title", `"Stretch"`, 100, "A"),
		op("s-2", "task", series, "recurrence", `"every day for 2 times"`, 100, "A"),
		op("s-3", "task", series, "habit", `true`, 100, "A"),
		op("s-4", "task", series, "due", `{"date":"2026-10-13"}`, 100, "A"),
		op("s-5", "task", series, "completed_at", `null`, 100, "A"),
		op("k-1", "task", skipped, "title", `"Stretch"`, 100, "A"),
		op("k-2", "task", skipped, "series_id", `"s1"`, 100, "A"),
		op("k-3", "task", skipped, "due", `{"date":"2026-10-12"}`, 100, "A"),
		op("k-4", "task", skipped, "completed_at", `100`, 100, "A"),
		op("k-5", "task", skipped, "skipped", `true`, 100, "A"),
	}
	if _, err := s.ApplyStrict(ctx, "u1", ops); err != nil {
		t.Fatal(err)
	}
	complete := func(today string) (bool, string) {
		t.Helper()
		existing, err := s.Get(ctx, "u1", "task", series)
		if err != nil {
			t.Fatal(err)
		}
		body := map[string]json.RawMessage{"completed_at": json.RawMessage(`200`)}
		recordID, record, ok, err := s.RecurringCompletion(ctx, "u1", series, body, existing, today)
		if err != nil {
			t.Fatal(err)
		}
		var batch []Op
		n := 0
		add := func(id string, fields map[string]json.RawMessage) {
			for f, v := range fields {
				n++
				batch = append(batch, Op{ID: id + f + today, Entity: "task", EntityID: id, Field: f, Value: v, TS: int64(300 + n), Device: "server"})
			}
		}
		add(series, body)
		if ok {
			add(recordID, record)
		}
		if _, err := s.ApplyStrict(ctx, "u1", batch); err != nil {
			t.Fatal(err)
		}
		return ok, string(body["due"])
	}
	// First completion (the 13th): one completed occurrence so far besides the
	// skip, which does not count, so the series rolls to the 14th.
	ok, due := complete("2026-10-13")
	if !ok || due != `{"date":"2026-10-14"}` {
		t.Fatalf("first completion: ok=%v due=%s, want a roll to the 14th", ok, due)
	}
	// Second completion: two real completions reached, the series ends.
	if ok, _ := complete("2026-10-14"); ok {
		t.Fatal("second completion rolled; the skipped record was counted or the end was missed")
	}
	e, _ := s.Get(ctx, "u1", "task", series)
	if nullish(e["completed_at"]) {
		t.Fatal("series not completed after its second completion")
	}
}
