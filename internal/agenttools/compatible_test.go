package agenttools

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/recurrence/recurrence10"
)

// TestRulesReadBy10: an assistant's rule on one weekday whose due date falls
// on it is planned as every N weeks, which a 1.0 client reads; on another due
// date it keeps the weekday (recurrence-1-0-compatible).
func TestRulesReadBy10(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t-sat", "Bins", map[string]any{"due": map[string]any{"date": "2026-11-07"}})
	f.task("u1", "t-wed", "Paper", map[string]any{"due": map[string]any{"date": "2026-11-04"}})
	c := agent("u1")
	created, err := f.reg.Plan(context.Background(), c, "create_tasks", json.RawMessage(`{"items":[
		{"title":"Sat","due":{"date":"2026-11-07"},"recurrence":"every 2 weeks on saturday"},
		{"title":"Wed","due":{"date":"2026-11-04"},"recurrence":"every 2 weeks on saturday"}]}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	updated, err := f.reg.Plan(context.Background(), c, "update_tasks", json.RawMessage(`{"updates":[
		{"id":"t-sat","recurrence":"every 2 weeks on sat"},
		{"id":"t-wed","recurrence":"every 2 weeks on sat"}]}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		patch     map[string]json.RawMessage
		due, want string
	}{
		{created.Changes[0].Patch, "2026-11-07", `"every 2 weeks"`},
		{created.Changes[1].Patch, "2026-11-04", `"every 2 weeks on saturday"`},
		{updated.Changes[0].Patch, "2026-11-07", `"every 2 weeks"`},
		{updated.Changes[1].Patch, "2026-11-04", `"every 2 weeks on saturday"`},
	}
	for i, tc := range cases {
		got := string(tc.patch["recurrence"])
		if got != tc.want {
			t.Errorf("%d: %s, want %s", i, got, tc.want)
			continue
		}
		var rule string
		_ = json.Unmarshal(tc.patch["recurrence"], &rule)
		if err := recurrence10.Check(rule, tc.due); err != nil {
			t.Error(err)
		}
	}
}
