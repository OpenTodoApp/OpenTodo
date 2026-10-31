package agenttools

import (
	"encoding/json"
	"strings"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// next_occurrences (OpenSpec change series-occurrences, task 4.3): the next three
// projected dates of an open recurring task; none on a plain task; done records
// count toward "for N times". Dated in the future, so the day the test runs does not matter.
func TestNextOccurrencesInResults(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "w1", "Study", map[string]any{"recurrence": "every weekday", "due": map[string]any{"date": "2030-01-10", "time": "18:00"}})
	f.task("u1", "n1", "Course", map[string]any{"recurrence": "every day for 3 times", "due": map[string]any{"date": "2030-01-10"}})
	f.task("u1", opsync.OccurrenceID("n1", "2030-01-09"), "Course", map[string]any{"series_id": "n1", "due": map[string]any{"date": "2030-01-09"}, "completed_at": 1})
	f.task("u1", "p1", "Once", map[string]any{"due": map[string]any{"date": "2030-01-10"}})
	c := agent("u1")
	next := func(id string) string {
		raw, _ := json.Marshal(f.mustCall(c, "get_task", map[string]any{"id": id}))
		var out struct {
			Task struct {
				Next []string `json:"next_occurrences"`
			} `json:"task"`
		}
		_ = json.Unmarshal(raw, &out)
		if out.Task.Next == nil && strings.Contains(string(raw), "next_occurrences") {
			t.Fatalf("unexpected shape: %s", raw)
		}
		return strings.Join(out.Task.Next, ",")
	}
	// Thursday the 10th: Friday, then Monday and Tuesday.
	if got := next("w1"); got != "2030-01-11,2030-01-14,2030-01-15" {
		t.Fatalf("weekday series = %q", got)
	}
	// One done and the current one: a single occurrence is left.
	if got := next("n1"); got != "2030-01-11" {
		t.Fatalf("for 3 times = %q", got)
	}
	if got := next("p1"); got != "" {
		t.Fatalf("plain task = %q", got)
	}
}
