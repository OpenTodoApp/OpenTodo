package agenttools

import (
	"encoding/json"
	"slices"
	"testing"
	"time"
)

// list_tasks with sort urgency (OpenSpec change urgency-sort, urgency-score
// "Urgency order in agent tools").
func TestListTasksByUrgency(t *testing.T) {
	f := newFixture(t)
	reader := Caller{UserID: "u1", Scope: "read"}
	created := f.clock.UnixMilli()
	f.task("u1", "flights", "Book flights", map[string]any{"blocked_by": []string{"visa"}, "created_at": created})
	f.task("u1", "visa", "Visa", map[string]any{"priority": 1, "due": map[string]any{"date": "2026-10-12"}, "created_at": created})
	f.task("u1", "plain", "Plain", map[string]any{"created_at": created})
	f.task("u1", "late", "Late", map[string]any{"due": map[string]any{"date": "2026-10-02"}, "created_at": created})
	f.task("u1", "timed", "Timed", map[string]any{"created_at": created})
	f.task("u1", "done", "Done", map[string]any{"priority": 1, "completed_at": created, "created_at": created})
	f.put("u1", "time_entry", "running", map[string]any{"task_id": "timed", "user_id": "u1", "started_at": f.clock.Add(-time.Hour).UnixMilli(), "ended_at": nil, "note": "", "created_at": 1})

	type result struct {
		ID           string   `json:"id"`
		Urgency      *float64 `json:"urgency"`
		UrgencyParts *[]struct {
			Key   string  `json:"key"`
			Value float64 `json:"value"`
		} `json:"urgency_parts"`
	}
	list := func(a map[string]any) []result {
		raw, _ := json.Marshal(f.mustCall(reader, "list_tasks", a)["tasks"])
		var out []result
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatal(err)
		}
		return out
	}
	got := list(map[string]any{"view": "all", "sort": "urgency", "include_completed": true})
	var order []string
	for _, r := range got {
		order = append(order, r.ID)
	}
	// visa 22.80 (due today, p1, blocks one), late 12.00, timed 4.00, plain 0.00, flights -5.00, done last.
	if want := []string{"visa", "late", "timed", "plain", "flights", "done"}; !slices.Equal(order, want) {
		t.Fatalf("order = %v, want %v", order, want)
	}
	if got[0].Urgency == nil || *got[0].Urgency != 22.8 || got[0].UrgencyParts == nil || len(*got[0].UrgencyParts) != 3 || (*got[0].UrgencyParts)[2].Key != "blocks" {
		t.Fatalf("first result = %+v", got[0])
	}
	if got[3].Urgency == nil || *got[3].Urgency != 0 || got[3].UrgencyParts == nil || len(*got[3].UrgencyParts) != 0 {
		t.Fatalf("a task with nothing set has the score 0 and no parts: %+v", got[3])
	}
	if got[5].Urgency != nil {
		t.Fatalf("a completed task has no score: %+v", got[5])
	}
	// Paging keeps the order: two pages of three.
	out := f.mustCall(reader, "list_tasks", map[string]any{"sort": "urgency", "limit": 3})
	next, _ := out["next_cursor"].(string)
	second := f.mustCall(reader, "list_tasks", map[string]any{"sort": "urgency", "limit": 3, "cursor": next})
	if ids := append(taskOrder(t, out), taskOrder(t, second)...); !slices.Equal(ids, []string{"visa", "late", "timed", "plain", "flights"}) {
		t.Fatalf("paged = %v", ids)
	}
	// The default order is unchanged and carries no score.
	for _, r := range list(map[string]any{}) {
		if r.Urgency != nil {
			t.Fatalf("default order carries a score: %+v", r)
		}
	}
	if _, err := f.call(reader, "list_tasks", map[string]any{"sort": "random"}); !isArgErr(err) {
		t.Fatalf("sort random: %v", err)
	}
}

func taskOrder(t *testing.T, out map[string]any) []string {
	t.Helper()
	raw, _ := json.Marshal(out["tasks"])
	var list []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &list); err != nil {
		t.Fatal(err)
	}
	ids := make([]string, 0, len(list))
	for _, x := range list {
		ids = append(ids, x.ID)
	}
	return ids
}
