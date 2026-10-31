package sync

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

// TestValidateEnergy (OpenSpec change task-energy, design D1): energy is "",
// "deep", "medium" or "low"; anything else, null included, is refused.
func TestValidateEnergy(t *testing.T) {
	for _, c := range []struct {
		value string
		ok    bool
	}{{`""`, true}, {`"deep"`, true}, {`"medium"`, true}, {`"low"`, true}, {`"high"`, false}, {`"Deep"`, false}, {`2`, false}, {`null`, false}, {`true`, false}} {
		err := Validate(op("1", "task", "t1", "energy", c.value, 1, "A"))
		if c.ok && err != nil {
			t.Errorf("%s rejected: %v", c.value, err)
		}
		if !c.ok && !errors.Is(err, ErrInvalidOp) {
			t.Errorf("%s accepted, want ErrInvalidOp (got %v)", c.value, err)
		}
	}
}

// Two devices set different energies and a third the estimate, offline:
// every order converges per field on the greater timestamp.
func TestEnergyConvergesPerField(t *testing.T) {
	ctx := context.Background()
	low := []Op{op("a1", "task", "t1", "energy", `"low"`, 200, "A")}
	deep := []Op{op("b1", "task", "t1", "energy", `"deep"`, 300, "B")}
	est := []Op{op("c1", "task", "t1", "estimate_minutes", `45`, 250, "C")}
	for user, order := range map[string][][]Op{"u1": {low, deep, est}, "u2": {deep, est, low}, "u3": {est, low, deep}} {
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
		if string(row["energy"]) != `"deep"` || string(row["estimate_minutes"]) != `45` {
			t.Fatalf("%s: energy %s, estimate %s", user, row["energy"], row["estimate_minutes"])
		}
	}
}

// A refused value leaves the energy unchanged.
func TestInvalidEnergyLeavesValue(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.ApplyStrict(ctx, "u1", []Op{op("1", "task", "t1", "energy", `"medium"`, 100, "A")}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyStrict(ctx, "u1", []Op{op("2", "task", "t1", "energy", `"high"`, 200, "A")}); err == nil {
		t.Fatal("high accepted")
	}
	row, err := s.Get(ctx, "u1", "task", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if string(row["energy"]) != `"medium"` {
		t.Fatalf("energy = %s, want medium", row["energy"])
	}
}

// A completed habit's occurrence record keeps the series' energy.
func TestRecurringCompletionKeepsEnergy(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.ApplyStrict(ctx, "u1", []Op{
		op("s-1", "task", "s1", "title", `"Stretch"`, 100, "A"),
		op("s-2", "task", "s1", "recurrence", `"every day"`, 100, "A"),
		op("s-3", "task", "s1", "due", `{"date":"2026-10-13"}`, 100, "A"),
		op("s-4", "task", "s1", "energy", `"low"`, 100, "A"),
	}); err != nil {
		t.Fatal(err)
	}
	existing, err := s.Get(ctx, "u1", "task", "s1")
	if err != nil {
		t.Fatal(err)
	}
	body := map[string]json.RawMessage{"completed_at": json.RawMessage(`200`)}
	_, record, ok, err := s.RecurringCompletion(ctx, "u1", "s1", body, existing, "2026-10-13")
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if string(record["energy"]) != `"low"` {
		t.Fatalf("record energy = %s, want low", record["energy"])
	}
}
