package recurrence_test

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	"github.com/OpenTodoApp/opentodo/internal/recurrence/recurrence10"
)

// TestCompatibleVectors runs the "compatible" vectors shared with
// web/src/lib/recurrence.test.ts, and checks that every result is a rule a
// 1.0 client reads whenever one gives the same dates (recurrence-1-0-compatible).
func TestCompatibleVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/recurrence.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Compatible []struct {
			Name     string  `json:"name"`
			Rule     string  `json:"rule"`
			Due      *string `json:"due"`
			Expected string  `json:"expected"`
		} `json:"compatible"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Compatible) < 10 {
		t.Fatalf("only %d compatible vectors", len(v.Compatible))
	}
	for _, c := range v.Compatible {
		due := ""
		if c.Due != nil {
			due = *c.Due
		}
		got := recurrence.Compatible(c.Rule, due)
		if got != c.Expected {
			t.Errorf("%s: Compatible(%q, %q) = %q, want %q", c.Name, c.Rule, due, got, c.Expected)
		}
		if _, err := recurrence.Parse(got); err != nil {
			continue
		}
		if err := recurrence10.Check(got, due); err != nil {
			t.Errorf("%s: %v", c.Name, err)
		}
	}
}

// TestCheckCatchesTheNewForm: the check fails a writer that stores the new
// form where 1.0's rule means the same thing.
func TestCheckCatchesTheNewForm(t *testing.T) {
	if recurrence10.Check("every 2 weeks on saturday", "2026-11-07") == nil {
		t.Error("every 2 weeks on saturday due on a Saturday passed")
	}
	for _, ok := range [][2]string{{"every 2 weeks on saturday", "2026-11-04"}, {"every 2 weeks on saturday", ""}, {"every 3 weeks on monday, thursday", "2026-11-02"}, {"every 2 weeks", "2026-11-07"}} {
		if err := recurrence10.Check(ok[0], ok[1]); err != nil {
			t.Error(err)
		}
	}
}

func TestFromRRULECompatible(t *testing.T) {
	for _, c := range []struct{ rrule, due, want string }{
		{"FREQ=WEEKLY;INTERVAL=2;BYDAY=SA", "2026-11-07", "every 2 weeks"},
		{"FREQ=WEEKLY;INTERVAL=2;BYDAY=SA", "2026-11-04", "every 2 weeks on saturday"},
		{"FREQ=WEEKLY;INTERVAL=2;BYDAY=SA", "", "every 2 weeks on saturday"},
		{"FREQ=WEEKLY;INTERVAL=2;BYDAY=SA;COUNT=4", "2026-11-07", "every 2 weeks for 4 times"},
	} {
		r, ok := recurrence.FromRRULE(c.rrule, c.due)
		if !ok || r.Canonical() != c.want {
			t.Errorf("FromRRULE(%s, %q) = %q ok=%v, want %q", c.rrule, c.due, r.Canonical(), ok, c.want)
		}
		if err := recurrence10.Check(r.Canonical(), c.due); err != nil {
			t.Error(err)
		}
	}
}
