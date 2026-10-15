package sync

import (
	"context"
	"testing"
)

// TestValidateStart (OpenSpec someday-and-evening D1): start is null,
// "someday" or a real date; evening is a boolean.
func TestValidateStart(t *testing.T) {
	cases := []struct {
		field, value string
		ok           bool
	}{
		{"start", `"2026-11-03"`, true}, {"start", `"someday"`, true}, {"start", `null`, true},
		{"start", `"later"`, false}, {"start", `"2026-02-30"`, false}, {"start", `"2026-11-03T09:00"`, false},
		{"start", `"Someday"`, false}, {"start", `true`, false},
		{"evening", `true`, true}, {"evening", `false`, true}, {"evening", `"yes"`, false}, {"evening", `1`, false},
	}
	for _, c := range cases {
		err := Validate(op("1", "task", "t1", c.field, c.value, 1, "A"))
		if (err == nil) != c.ok {
			t.Errorf("%s %s: ok=%v, err=%v", c.field, c.value, c.ok, err)
		}
	}
}

// Concurrent date and Someday writes converge to one value, whatever the order.
func TestStartConverges(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	a := op("a", "task", "t1", "start", `"2026-11-03"`, 200, "A")
	b := op("b", "task", "t1", "start", `"someday"`, 300, "B")
	for user, order := range map[string][]Op{"u1": {a, b}, "u2": {b, a}} {
		if _, err := s.Apply(ctx, user, order); err != nil {
			t.Fatal(err)
		}
		row, err := s.Get(ctx, user, "task", "t1")
		if err != nil {
			t.Fatal(err)
		}
		if string(row["start"]) != `"someday"` {
			t.Fatalf("%s: start %s", user, row["start"])
		}
	}
}
