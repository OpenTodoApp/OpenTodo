package agenttools

import (
	"encoding/json"
	"fmt"
	"testing"
)

// TestTodaySummaryTimeSensitive (OpenSpec change today-waiting-time-sensitive,
// task 3.1): a waiting task due today with a time, or with a deadline today, is
// marked time_sensitive and listed in waiting_time_sensitive soonest first; the
// slots are unchanged.
func TestTodaySummaryTimeSensitive(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	day := "2026-10-12"
	f.task("u1", "a", "A", map[string]any{"due": map[string]any{"date": day}, "created_at": 1})
	f.task("u1", "form", "Send the form", map[string]any{"due": map[string]any{"date": day, "time": "16:00"}, "created_at": 2})
	f.task("u1", "plain", "Plain", map[string]any{"due": map[string]any{"date": day}, "created_at": 3})
	f.task("u1", "taxes", "File the taxes", map[string]any{"due": map[string]any{"date": day}, "deadline": day, "created_at": 4})
	f.task("u1", "call", "Call", map[string]any{"due": map[string]any{"date": day, "time": "09:00"}, "created_at": 5})
	f.put("u1", "user_prefs", "me", map[string]any{"today_limit": 1})

	out := f.mustCall(c, "today_summary", map[string]any{"timezone": "UTC"})
	raw, _ := json.Marshal(out)
	var res struct {
		DueToday []struct {
			ID            string `json:"id"`
			Waiting       *bool  `json:"waiting_for_slot"`
			TimeSensitive *bool  `json:"time_sensitive"`
		} `json:"due_today"`
		Soon []string `json:"waiting_time_sensitive"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		t.Fatal(err)
	}
	if got := fmt.Sprint(res.Soon); got != "[call form taxes]" {
		t.Fatalf("waiting_time_sensitive = %s", got)
	}
	want := map[string]string{"a": "slot", "form": "true", "plain": "false", "taxes": "true", "call": "true"}
	for _, x := range res.DueToday {
		got := "slot"
		if x.Waiting != nil && *x.Waiting {
			got = "nil"
			if x.TimeSensitive != nil {
				got = fmt.Sprint(*x.TimeSensitive)
			}
		} else if x.TimeSensitive != nil {
			t.Fatalf("%s is in a slot and has time_sensitive", x.ID)
		}
		if got != want[x.ID] {
			t.Fatalf("%s: %s, want %s", x.ID, got, want[x.ID])
		}
	}
}

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
