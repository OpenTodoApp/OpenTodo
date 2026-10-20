package sync

import (
	"context"
	"testing"
)

// The on-drop rule is a view field only (OpenSpec change rule-boards).
func TestValidateOnDrop(t *testing.T) {
	if err := Validate(op("1", "view", "v1", "on_drop", `{"priority":1,"due":"today"}`, 1, "A")); err != nil {
		t.Fatalf("view rule refused: %v", err)
	}
	if err := Validate(op("2", "view", "v1", "on_drop", `null`, 1, "A")); err != nil {
		t.Fatalf("null rule refused: %v", err)
	}
	for _, e := range []string{"task", "project", "label"} {
		if err := Validate(op("3", e, "x1", "on_drop", `{"priority":1}`, 1, "A")); err == nil {
			t.Errorf("on_drop accepted on %s", e)
		}
	}
	if err := Validate(op("4", "view", "v1", "on_drop", `{"priority":5}`, 1, "A")); err == nil {
		t.Error("priority 5 accepted")
	}
}

// Two offline rules on one view converge whole on the greater (ts, device),
// and a later rename does not touch the rule (spec "Concurrent edits to one
// rule", "Older client receives a rule").
func TestOnDropConvergesWhole(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	name := op("n", "view", "v1", "name", `"Errands"`, 100, "A")
	a := op("a", "view", "v1", "on_drop", `{"priority":1}`, 200, "A")
	b := op("b", "view", "v1", "on_drop", `{"add_labels":["errand"]}`, 300, "B")
	rename := op("r", "view", "v1", "name", `"Out and about"`, 400, "C")
	for user, order := range map[string][]Op{"u1": {name, a, b, rename}, "u2": {rename, b, a, name}} {
		if _, err := s.Apply(ctx, user, order); err != nil {
			t.Fatal(err)
		}
		row, err := s.Get(ctx, user, "view", "v1")
		if err != nil {
			t.Fatal(err)
		}
		if string(row["on_drop"]) != `{"add_labels":["errand"]}` || string(row["name"]) != `"Out and about"` {
			t.Fatalf("%s: on_drop %s name %s", user, row["on_drop"], row["name"])
		}
	}
}
