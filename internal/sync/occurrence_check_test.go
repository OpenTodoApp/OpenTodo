package sync

import (
	"context"
	"errors"
	"testing"
)

// OpenSpec change series-exceptions, task 1.1: "Invalid occurrence date" and
// per-field last-writer-wins on a record.

func TestOccurrenceDateValidation(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	// Not a date: refused by the kind.
	if err := Validate(op("k", "task", "r1", "occurrence_date", `"2026-10-14T09:00"`, 1, "A")); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("a date-time was accepted: %v", err)
	}
	// On a task without series_id: refused, the task is unchanged.
	res, err := s.Apply(ctx, "u1", []Op{
		op("a1", "task", "plain", "title", `"Plain"`, 100, "A"),
		op("a2", "task", "plain", "occurrence_date", `"2026-10-14"`, 100, "A"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonInvalidOccurrence {
		t.Fatalf("rejected = %+v, want the occurrence date", res.Rejected)
	}
	if e, _ := s.Get(ctx, "u1", "task", "plain"); !IsNull(e["occurrence_date"]) {
		t.Fatalf("occurrence_date = %s on a plain task", e["occurrence_date"])
	}
	// Created with series_id in the same batch: accepted.
	res, err = s.Apply(ctx, "u1", []Op{
		op("b1", "task", "rec", "occurrence_date", `"2026-10-14"`, 100, "A"),
		op("b2", "task", "rec", "series_id", `"s"`, 100, "A"),
	})
	if err != nil || len(res.Rejected) != 0 {
		t.Fatalf("record = %+v, %v", res, err)
	}
	// The same value again is fine; another value or null is refused.
	if res, _ := s.Apply(ctx, "u1", []Op{op("c1", "task", "rec", "occurrence_date", `"2026-10-14"`, 200, "B")}); len(res.Rejected) != 0 {
		t.Fatalf("same value refused: %+v", res.Rejected)
	}
	for i, v := range []string{`"2026-10-15"`, `null`} {
		res, _ := s.Apply(ctx, "u1", []Op{op("d"+string(rune('0'+i)), "task", "rec", "occurrence_date", v, 300, "B")})
		if len(res.Rejected) != 1 {
			t.Fatalf("change to %s accepted", v)
		}
	}
	if e, _ := s.Get(ctx, "u1", "task", "rec"); string(e["occurrence_date"]) != `"2026-10-14"` {
		t.Fatalf("occurrence_date = %s, want the first value", e["occurrence_date"])
	}
}

func TestOccurrenceRecordConvergesPerField(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	// Device A moves the occurrence of the 14th, device B completes it, both offline.
	a := []Op{
		op("a1", "task", "rec", "series_id", `"s"`, 100, "A"),
		op("a2", "task", "rec", "occurrence_date", `"2026-10-14"`, 100, "A"),
		op("a3", "task", "rec", "due", `{"date":"2026-10-14","time":"19:00"}`, 100, "A"),
		op("a4", "task", "rec", "completed_at", `null`, 100, "A"),
	}
	b := []Op{
		op("b1", "task", "rec", "series_id", `"s"`, 200, "B"),
		op("b2", "task", "rec", "occurrence_date", `"2026-10-14"`, 200, "B"),
		op("b3", "task", "rec", "due", `{"date":"2026-10-14","time":"18:00"}`, 200, "B"),
		op("b4", "task", "rec", "completed_at", `5`, 200, "B"),
	}
	for _, batch := range [][]Op{b, a} {
		if res, err := s.Apply(ctx, "u1", batch); err != nil || len(res.Rejected) != 0 {
			t.Fatalf("apply = %+v, %v", res, err)
		}
	}
	e, _ := s.Get(ctx, "u1", "task", "rec")
	if string(e["completed_at"]) != `5` || string(e["due"]) != `{"date":"2026-10-14","time":"18:00"}` {
		t.Fatalf("record = due %s completed %s, want the later batch's", e["due"], e["completed_at"])
	}
}
