package httpapi

import (
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/recurrence/recurrence10"
)

// TestRestRuleReadBy10: a rule on one weekday whose due date falls on it is
// stored as every N weeks, which a 1.0 client reads; on another due date it
// keeps the weekday. A PATCH without a due uses the task's
// (recurrence-1-0-compatible).
func TestRestRuleReadBy10(t *testing.T) {
	e := registeredEnv(t)
	check := func(out map[string]any, due, want string) {
		t.Helper()
		if out["recurrence"] != want {
			t.Fatalf("stored %v for a task due %s, want %q", out["recurrence"], due, want)
		}
		if err := recurrence10.Check(want, due); err != nil {
			t.Fatal(err)
		}
	}
	// 2026-11-07 is a Saturday, 2026-11-04 a Wednesday.
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Bins", "recurrence": "every 2 weeks on saturday", "due": map[string]any{"date": "2026-11-07"}})
	e.mustStatus(resp, 201, out)
	check(out, "2026-11-07", "every 2 weeks")
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Paper", "recurrence": "every 2 weeks on sat", "due": map[string]any{"date": "2026-11-04"}})
	e.mustStatus(resp, 201, out)
	check(out, "2026-11-04", "every 2 weeks on saturday")
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Glass", "due": map[string]any{"date": "2026-11-07"}})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+out["id"].(string), map[string]any{"recurrence": "every 2 weeks on saturday"})
	e.mustStatus(resp, 200, out)
	check(out, "2026-11-07", "every 2 weeks")
}
