package importer

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/recurrence/recurrence10"
)

// TestImportedRulesReadBy10: an imported rule on one weekday whose due date
// falls on it is stored as every N weeks, which a 1.0 client reads; on another
// due date it keeps the weekday (recurrence-1-0-compatible).
func TestImportedRulesReadBy10(t *testing.T) {
	h := newHarness(t)
	h.fixedNow(time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC)) // a Wednesday
	h.run("title,due,recurrence\n"+
		"Sat,2026-11-07,every other saturday\n"+
		"Wed,2026-11-04,every other saturday\n"+
		"Undated,,every other saturday\n"+
		"Feed,2026-11-07,RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA\n", Options{})
	own := `{"format": "opentodo-export", "version": 1, "exportedAt": "2026-11-04T10:00:00Z", "tasks": [
	  {"id": "o1", "title": "Own", "description": "", "priority": 4, "position": 1, "created_at": 5, "labels": [], "recurrence": "every 2 weeks on saturday", "due": {"date": "2026-11-07"}}]}`
	h.run(own, Options{})
	got := byTitle(h.list("task", false))
	for title, want := range map[string]string{"Sat": "every 2 weeks", "Wed": "every 2 weeks on saturday", "Undated": "every 2 weeks", "Feed": "every 2 weeks", "Own": "every 2 weeks"} {
		task := got[title]
		if task == nil {
			t.Fatalf("%s not imported: %v", title, got)
		}
		var due struct {
			Date string `json:"date"`
		}
		_ = json.Unmarshal(task["due"], &due)
		if rule := str(task, "recurrence"); rule != want {
			t.Errorf("%s (due %s): %q, want %q", title, due.Date, rule, want)
		} else if err := recurrence10.Check(rule, due.Date); err != nil {
			t.Errorf("%s: %v", title, err)
		}
	}
}
