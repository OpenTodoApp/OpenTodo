package cli

import (
	"strings"
	"testing"
)

// TestDefaultReminder (default-reminders 4.3): `ot add` and `ot edit` ask the
// server for the account's default reminder when they set a due date, unless
// --no-default-reminder or --remind is given.
func TestDefaultReminder(t *testing.T) {
	h := newHarness(t)
	h.login()
	op := func(field, value string) map[string]any {
		return map[string]any{"id": "pref-" + field, "entity": "user_prefs", "entityId": "me", "field": field, "value": value, "ts": 1, "device": "seed"}
	}
	h.apiJSON("POST", "/api/v1/sync", map[string]any{"device": "seed", "cursor": 0, "ops": []any{
		op("reminder_default_timed", "-10"), op("reminder_default_dated", "-1440"),
	}})
	reminders := func(taskID string) []map[string]any {
		var out []map[string]any
		for _, r := range h.apiJSON("GET", "/api/v1/reminders", nil)["reminders"].([]any) {
			if m := r.(map[string]any); m["task_id"] == taskID && m["deleted_at"] == nil {
				out = append(out, m)
			}
		}
		return out
	}

	id := strings.TrimSpace(h.mustRun("add", "Dentist", "--due", "tomorrow", "--time", "09:00"))
	if rs := reminders(id); len(rs) != 1 || rs[0]["offset_minutes"] != float64(-10) || rs[0]["kind"] != "relative" || rs[0]["fire_at"] == nil {
		t.Fatalf("add: %v", rs)
	}

	off := strings.TrimSpace(h.mustRun("add", "Quiet", "--due", "tomorrow", "--no-default-reminder"))
	if rs := reminders(off); len(rs) != 0 {
		t.Fatalf("--no-default-reminder: %v", rs)
	}
	own := strings.TrimSpace(h.mustRun("add", "Call", "--due", "tomorrow", "--time", "10:00", "--remind", "5 min before"))
	if rs := reminders(own); len(rs) != 1 || rs[0]["offset_minutes"] != float64(-5) {
		t.Fatalf("--remind wins: %v", rs)
	}
	undated := strings.TrimSpace(h.mustRun("add", "Someday maybe"))
	if rs := reminders(undated); len(rs) != 0 {
		t.Fatalf("undated: %v", rs)
	}

	// edit: scheduling sends the flag; --no-default-reminder leaves it out.
	h.mustRun("edit", undated, "--due", "tomorrow")
	if rs := reminders(undated); len(rs) != 1 || rs[0]["offset_minutes"] != float64(-1440) {
		t.Fatalf("edit: %v", rs)
	}
	plain := strings.TrimSpace(h.mustRun("add", "Plain"))
	h.mustRun("edit", plain, "--due", "tomorrow", "--no-default-reminder")
	if rs := reminders(plain); len(rs) != 0 {
		t.Fatalf("edit --no-default-reminder: %v", rs)
	}
}
