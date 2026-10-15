package sync

import (
	"context"
	"testing"
)

// TestValidateDeadline (OpenSpec deadlines D1): null or a real calendar date,
// nothing with a time, a zone or an object shape.
func TestValidateDeadline(t *testing.T) {
	cases := []struct {
		value string
		ok    bool
	}{
		{`"2026-11-06"`, true}, {`"2028-02-29"`, true}, {`null`, true},
		{`"2026-02-30"`, false}, {`"2026-11-06T09:00"`, false}, {`"2026-11-6"`, false},
		{`{"date":"2026-11-06"}`, false}, {`"next friday"`, false}, {`20261106`, false},
	}
	for _, c := range cases {
		err := Validate(op("1", "task", "t1", "deadline", c.value, 1, "A"))
		if (err == nil) != c.ok {
			t.Errorf("deadline %s: ok=%v, err=%v", c.value, c.ok, err)
		}
	}
	if err := Validate(op("2", "reminder", "r1", "kind", `"deadline"`, 1, "A")); err != nil {
		t.Errorf("reminder kind deadline refused: %v", err)
	}
	if err := Validate(op("3", "reminder", "r1", "kind", `"start"`, 1, "A")); err == nil {
		t.Error("unknown reminder kind accepted")
	}
}

// Two offline writes of the deadline converge on the greater (ts, device),
// whatever order they arrive in, and leave due untouched.
func TestDeadlineConverges(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	due := op("d", "task", "t1", "due", `{"date":"2026-11-03"}`, 100, "A")
	a := op("a", "task", "t1", "deadline", `"2026-11-06"`, 200, "A")
	b := op("b", "task", "t1", "deadline", `"2026-11-07"`, 300, "B")
	for user, order := range map[string][]Op{"u1": {due, a, b}, "u2": {b, a, due}} {
		if _, err := s.Apply(ctx, user, order); err != nil {
			t.Fatal(err)
		}
		row, err := s.Get(ctx, user, "task", "t1")
		if err != nil {
			t.Fatal(err)
		}
		if string(row["deadline"]) != `"2026-11-07"` || string(row["due"]) != `{"date":"2026-11-03"}` {
			t.Fatalf("%s: deadline %s due %s", user, row["deadline"], row["due"])
		}
	}
}
