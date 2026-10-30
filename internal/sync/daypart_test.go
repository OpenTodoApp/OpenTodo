package sync

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

// TestValidateDayPart (OpenSpec change day-parts, design D1): day_part is
// null, "morning" or "afternoon"; Evening is the evening flag, never a value.
func TestValidateDayPart(t *testing.T) {
	for _, c := range []struct {
		value string
		ok    bool
	}{{`null`, true}, {`"morning"`, true}, {`"afternoon"`, true}, {`"night"`, false}, {`"evening"`, false}, {`"Morning"`, false}, {`true`, false}, {`""`, false}} {
		err := Validate(op("1", "task", "t1", "day_part", c.value, 1, "A"))
		if c.ok && err != nil {
			t.Errorf("%s rejected: %v", c.value, err)
		}
		if !c.ok && !errors.Is(err, ErrInvalidOp) {
			t.Errorf("%s accepted, want ErrInvalidOp (got %v)", c.value, err)
		}
	}
}

// Two devices set different parts offline, each writing the pair (D2): every
// order converges on the batch with the greater timestamps, as a whole.
func TestDayPartPairConverges(t *testing.T) {
	ctx := context.Background()
	morning := []Op{op("a1", "task", "t1", "day_part", `"morning"`, 200, "A"), op("a2", "task", "t1", "evening", `false`, 200, "A")}
	evening := []Op{op("b1", "task", "t1", "day_part", `null`, 300, "B"), op("b2", "task", "t1", "evening", `true`, 300, "B")}
	for user, order := range map[string][][]Op{"u1": {morning, evening}, "u2": {evening, morning}} {
		s := newTestService(t)
		for _, batch := range order {
			if _, err := s.Apply(ctx, user, batch); err != nil {
				t.Fatal(err)
			}
		}
		row, err := s.Get(ctx, user, "task", "t1")
		if err != nil {
			t.Fatal(err)
		}
		if string(row["evening"]) != `true` || !IsNull(row["day_part"]) {
			t.Fatalf("%s: evening %s, day_part %s", user, row["evening"], row["day_part"])
		}
	}
}

// A completed habit keeps its part on the series and the occurrence record.
func TestRecurringCompletionKeepsDayPart(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	series := "s1"
	if _, err := s.ApplyStrict(ctx, "u1", []Op{
		op("s-1", "task", series, "title", `"Stretch"`, 100, "A"),
		op("s-2", "task", series, "recurrence", `"every day"`, 100, "A"),
		op("s-3", "task", series, "habit", `true`, 100, "A"),
		op("s-4", "task", series, "due", `{"date":"2026-10-13"}`, 100, "A"),
		op("s-5", "task", series, "day_part", `"morning"`, 100, "A"),
	}); err != nil {
		t.Fatal(err)
	}
	existing, err := s.Get(ctx, "u1", "task", series)
	if err != nil {
		t.Fatal(err)
	}
	body := map[string]json.RawMessage{"completed_at": json.RawMessage(`200`)}
	_, record, ok, err := s.RecurringCompletion(ctx, "u1", series, body, existing, "2026-10-13")
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if string(record["day_part"]) != `"morning"` {
		t.Fatalf("record day_part = %s, want morning", record["day_part"])
	}
	if _, has := body["day_part"]; has {
		t.Fatal("the series' part was rewritten")
	}
}
