package sync

import (
	"context"
	"errors"
	"testing"
)

// TestValidateSector (OpenSpec change time-sectors, design D1): sector is "" or
// a valid period; the spec's invalid values and null are refused.
func TestValidateSector(t *testing.T) {
	for _, c := range []struct {
		value string
		ok    bool
	}{
		{`""`, true}, {`"2026-W44"`, true}, {`"2026-W53"`, true}, {`"2026-11"`, true}, {`"2026-Q4"`, true},
		{`"2026-W54"`, false}, {`"2027-W53"`, false}, {`"2026-13"`, false}, {`"2026-Q5"`, false},
		{`"this week"`, false}, {`"1999-Q1"`, false}, {`null`, false}, {`44`, false},
	} {
		err := Validate(op("1", "task", "t1", "sector", c.value, 1, "A"))
		if c.ok && err != nil {
			t.Errorf("%s rejected: %v", c.value, err)
		}
		if !c.ok && !errors.Is(err, ErrInvalidOp) {
			t.Errorf("%s accepted, want ErrInvalidOp (got %v)", c.value, err)
		}
	}
	if err := Validate(op("1", "user_prefs", "me", "time_sectors", `"on"`, 1, "A")); err != nil {
		t.Errorf("time_sectors on: %v", err)
	}
}

// One-when batches (design D2): device A sets a sector and clears the date,
// device B dates the task and clears the sector, offline. Every order converges
// on the batch with the greater timestamp, never a mix.
func TestSectorBatchesConverge(t *testing.T) {
	ctx := context.Background()
	sectored := []Op{op("a1", "task", "t1", "sector", `"2026-W45"`, 300, "A"), op("a2", "task", "t1", "due", `null`, 300, "A")}
	dated := []Op{op("b1", "task", "t1", "due", `{"date":"2026-11-05"}`, 200, "B"), op("b2", "task", "t1", "sector", `""`, 200, "B")}
	for user, order := range map[string][][]Op{"u1": {sectored, dated}, "u2": {dated, sectored}} {
		s := newTestService(t)
		if _, err := s.Apply(ctx, user, []Op{op("c0", "task", "t1", "title", `"Book the venue"`, 100, "C")}); err != nil {
			t.Fatal(err)
		}
		for _, batch := range order {
			if _, err := s.Apply(ctx, user, batch); err != nil {
				t.Fatal(err)
			}
		}
		row, err := s.Get(ctx, user, "task", "t1")
		if err != nil {
			t.Fatal(err)
		}
		if string(row["sector"]) != `"2026-W45"` || string(row["due"]) != `null` {
			t.Fatalf("%s: sector %s, due %s", user, row["sector"], row["due"])
		}
	}
}

// A task created with a title writes no sector op, and a title edit from an
// older client keeps a sector another device set.
func TestSectorDefaultAndPassThrough(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.ApplyStrict(ctx, "u1", []Op{op("1", "task", "t1", "title", `"Plan"`, 100, "A")}); err != nil {
		t.Fatal(err)
	}
	row, err := s.Get(ctx, "u1", "task", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := row["sector"]; ok {
		t.Fatalf("a title-only task wrote a sector op: %s", row["sector"])
	}
	if _, err := s.ApplyStrict(ctx, "u1", []Op{op("2", "task", "t1", "sector", `"2026-W45"`, 200, "A")}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyStrict(ctx, "u1", []Op{op("3", "task", "t1", "title", `"Plan the offsite"`, 300, "old")}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyStrict(ctx, "u1", []Op{op("4", "task", "t1", "sector", `"SOON"`, 400, "A")}); err == nil {
		t.Fatal("SOON accepted")
	}
	row, _ = s.Get(ctx, "u1", "task", "t1")
	if string(row["sector"]) != `"2026-W45"` || string(row["title"]) != `"Plan the offsite"` {
		t.Fatalf("sector %s, title %s", row["sector"], row["title"])
	}
}
