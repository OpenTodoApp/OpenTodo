package sync

import (
	"context"
	"errors"
	"testing"
)

// TestValidateSampleField (OpenSpec change moments-and-onboarding, design D3):
// task.sample is a boolean; anything else is rejected.
func TestValidateSampleField(t *testing.T) {
	for _, c := range []struct {
		value string
		ok    bool
	}{{`true`, true}, {`false`, true}, {`"yes"`, false}, {`null`, false}, {`1`, false}} {
		err := Validate(op("1", "task", "t1", "sample", c.value, 1, "A"))
		if c.ok && err != nil {
			t.Errorf("sample %s rejected: %v", c.value, err)
		}
		if !c.ok && !errors.Is(err, ErrInvalidOp) {
			t.Errorf("sample %s accepted, want ErrInvalidOp (got %v)", c.value, err)
		}
	}
	if err := Validate(op("2", "user_prefs", "me", "start_checklist", `"hidden"`, 1, "A")); err != nil {
		t.Errorf("start_checklist rejected: %v", err)
	}
}

// An older server that does not know the field rejects its op as unknown while
// the task's other fields are accepted (first-run "Sample tasks": Older server).
func TestSampleOnOlderServer(t *testing.T) {
	saved := Schema["task"]["sample"]
	delete(Schema["task"], "sample")
	defer func() { Schema["task"]["sample"] = saved }()
	if err := Validate(op("1", "task", "t1", "sample", `true`, 1, "A")); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("older server accepted sample: %v", err)
	}
	if err := Validate(op("2", "task", "t1", "title", `"Tick me off"`, 1, "A")); err != nil {
		t.Fatalf("title rejected: %v", err)
	}
}

// Completing a sample task keeps the marker; an older client's title edit keeps it too.
func TestSampleSurvivesCompletionAndOlderEdit(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u1", []Op{
		op("a", "task", "t1", "title", `"Tick me off"`, 100, "A"),
		op("b", "task", "t1", "sample", `true`, 100, "A"),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Apply(ctx, "u1", []Op{
		op("c", "task", "t1", "completed_at", `200`, 200, "A"),
		op("d", "task", "t1", "title", `"Ticked"`, 200, "old"),
	}); err != nil {
		t.Fatal(err)
	}
	e, err := s.Get(ctx, "u1", "task", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if string(e["sample"]) != `true` || string(e["completed_at"]) != `200` {
		t.Fatalf("sample = %s, completed_at = %s", e["sample"], e["completed_at"])
	}
}
