package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// `ot task show` lists a task's reminders, location reminders included
// (OpenSpec change location-reminders, task 1.5).
func TestTaskShowListsLocationReminders(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("task", "stamps01", map[string]any{"title": "Buy stamps", "due": map[string]any{"date": "2030-01-07", "time": "18:00"},
		"location": map[string]any{"name": "Post office", "lat": 45.46, "lon": 9.19}})
	h.apiJSON("POST", "/api/v1/reminders", map[string]any{"task_id": "stamps01", "kind": "arrive", "radius_m": 150})
	h.apiJSON("POST", "/api/v1/reminders", map[string]any{"task_id": "stamps01", "kind": "relative", "offset_minutes": -30})
	out := h.mustRun("task", "show", "stamps01")
	for _, want := range []string{"Buy stamps", "Location:  Post office", "When I arrive at Post office (150 m)", "30 minutes before the due time"} {
		if !strings.Contains(out, want) {
			t.Fatalf("missing %q in:\n%s", want, out)
		}
	}
	schemas := loadSchemas(t)
	out = h.mustRun("task", "show", "stamps01", "--json")
	mustMatch(t, schemas, "task show", out, ref("task_detail"))
	var got struct {
		Reminders []map[string]any `json:"reminders"`
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil || len(got.Reminders) != 2 {
		t.Fatalf("json %s (%v)", out, err)
	}
}
