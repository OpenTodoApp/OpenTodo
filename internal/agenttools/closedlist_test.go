package agenttools

import (
	"encoding/json"
	"testing"
)

// TestTodaySummaryLimit (OpenSpec change today-closed-list, task 4.1):
// today_summary reports the Today limit and marks the tasks waiting for a slot
// with the shared fill rule; with no limit it reports null and nothing waits.
func TestTodaySummaryLimit(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	today := map[string]any{"date": "2026-10-12"}
	for i, id := range []string{"a", "b", "c", "d", "e"} {
		f.task("u1", id, "Task "+id, map[string]any{"due": today, "created_at": 1000 + i})
	}
	// A blocked task and a habit never take a slot.
	f.task("u1", "blocked", "Blocked", map[string]any{"due": today, "created_at": 1, "blocked_by": []string{"a"}})
	f.task("u1", "habit", "Stretch", map[string]any{"due": today, "created_at": 2, "recurrence": "every day", "habit": true})

	waits := func() (any, map[string]bool) {
		t.Helper()
		out := f.mustCall(c, "today_summary", map[string]any{"timezone": "UTC"})
		raw, _ := json.Marshal(out["due_today"])
		var tasks []struct {
			ID      string `json:"id"`
			Waiting *bool  `json:"waiting_for_slot"`
		}
		if err := json.Unmarshal(raw, &tasks); err != nil {
			t.Fatal(err)
		}
		got := map[string]bool{}
		for _, x := range tasks {
			if x.Waiting == nil {
				t.Fatalf("%s has no waiting_for_slot", x.ID)
			}
			got[x.ID] = *x.Waiting
		}
		return out["today_limit"], got
	}

	limit, got := waits()
	if limit != nil {
		t.Fatalf("limit off: today_limit = %v", limit)
	}
	for id, w := range got {
		if w {
			t.Fatalf("limit off: %s waits", id)
		}
	}

	f.put("u1", "user_prefs", "me", map[string]any{"today_limit": 3})
	limit, got = waits()
	if limit != 3 {
		t.Fatalf("today_limit = %v", limit)
	}
	want := map[string]bool{"a": false, "b": false, "c": false, "d": true, "e": true, "blocked": false, "habit": false}
	for id, w := range want {
		if got[id] != w {
			t.Fatalf("%s waiting = %v, want %v (all %v)", id, got[id], w, got)
		}
	}

	// Today's focus comes first: e takes a slot ahead of c.
	f.put("u1", "review", "me", map[string]any{"focus_date": "2026-10-12", "focus": "e"})
	_, got = waits()
	if got["e"] || !got["c"] || got["a"] || got["b"] {
		t.Fatalf("focus first: %v", got)
	}

	// An out-of-range value reads as off.
	f.put("u1", "user_prefs", "me", map[string]any{"today_limit": 40})
	if limit, _ = waits(); limit != nil {
		t.Fatalf("limit 40: today_limit = %v", limit)
	}
}
