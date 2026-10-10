package httpapi

import (
	"strings"
	"testing"
	"time"
)

// absolute-datetimes: REST create and patch accept and echo a zoned due.
func TestRestZonedDueRoundTrip(t *testing.T) {
	e := registeredEnv(t)
	zonedDue := map[string]any{"date": "2026-10-11", "time": "09:00", "tz": "Europe/Berlin"}
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Stand-up", "due": zonedDue})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if d := dueOf(t, out["due"]); d["date"] != "2026-10-11" || d["time"] != "09:00" || d["tz"] != "Europe/Berlin" {
		t.Fatalf("created due = %v", d)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if d := dueOf(t, out["due"]); d["tz"] != "Europe/Berlin" {
		t.Fatalf("read due = %v", d)
	}
	// A title edit leaves the zoned due untouched.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"title": "Daily stand-up"})
	e.mustStatus(resp, 200, out)
	if d := dueOf(t, out["due"]); d["tz"] != "Europe/Berlin" || d["time"] != "09:00" {
		t.Fatalf("due after title edit = %v", d)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"due": map[string]any{"date": "2026-10-12", "time": "14:35", "tz": "America/New_York"}})
	e.mustStatus(resp, 200, out)
	if d := dueOf(t, out["due"]); d["tz"] != "America/New_York" || d["time"] != "14:35" || d["date"] != "2026-10-12" {
		t.Fatalf("patched due = %v", d)
	}
	// Export carries tz.
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	found := false
	for _, raw := range out["tasks"].([]any) {
		if task := raw.(map[string]any); task["id"] == id {
			found = dueOf(t, task["due"])["tz"] == "America/New_York"
		}
	}
	if !found {
		t.Fatal("export lost the zoned due")
	}
}

func TestRestZonedDueWithoutTimeRejected(t *testing.T) {
	e := registeredEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Call", "due": map[string]any{"date": "2026-10-11", "time": "09:00"}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	for name, d := range map[string]map[string]any{
		"tz without time": {"date": "2026-10-11", "tz": "Europe/Berlin"},
		"unknown zone":    {"date": "2026-10-11", "time": "09:00", "tz": "Mars/Olympus"},
	} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"due": d})
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("%s: code %q", name, errCode(out))
		}
		if msg, _ := out["error"].(map[string]any)["message"].(string); !strings.Contains(msg, "tz") {
			t.Fatalf("%s: message %q does not name tz", name, msg)
		}
		resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "x", "due": d})
		e.mustStatus(resp, 400, out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if d := dueOf(t, out["due"]); d["time"] != "09:00" || d["tz"] != nil {
		t.Fatalf("due changed by a rejected write: %v", d)
	}
}

// A relative reminder on a zoned task fires relative to the zoned instant, not
// the device's reported offset; a recurring zoned series keeps its tz.
func TestRestZonedDueRemindersAndRecurrence(t *testing.T) {
	e, _ := pushEnv(t, false)
	e.do("POST", "/api/v1/sync", map[string]any{"device": "devA", "cursor": 0, "ops": []any{}, "tzOffset": -420})
	resp, task := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Stand-up", "due": map[string]any{"date": "2026-10-11", "time": "09:00", "tz": "Europe/Berlin"}})
	e.mustStatus(resp, 201, task)
	id := task["id"].(string)
	resp, rel := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": id, "kind": "relative", "offset_minutes": -10})
	e.mustStatus(resp, 201, rel)
	want := time.Date(2026, 10, 11, 6, 50, 0, 0, time.UTC).UnixMilli()
	if int64(rel["fire_at"].(float64)) != want {
		t.Fatalf("fire_at = %v, want %d", rel["fire_at"], want)
	}
	// Moving the zoned due over REST moves the reminder to the new instant
	// (spring-forward gap: 02:30 resolves to 03:00 CEST = 01:00 UTC).
	resp, out := e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"due": map[string]any{"date": "2026-03-29", "time": "02:30", "tz": "Europe/Berlin"}})
	e.mustStatus(resp, 200, out)
	resp, rel = e.do("GET", "/api/v1/reminders/"+rel["id"].(string), nil)
	e.mustStatus(resp, 200, rel)
	want = time.Date(2026, 3, 29, 0, 50, 0, 0, time.UTC).UnixMilli()
	if int64(rel["fire_at"].(float64)) != want {
		t.Fatalf("moved fire_at = %v, want %d", rel["fire_at"], want)
	}

	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"recurrence": "every day", "due": map[string]any{"date": dayOffset(0), "time": "09:00", "tz": "Asia/Tokyo"}})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": time.Now().UnixMilli()})
	e.mustStatus(resp, 200, out)
	if d := dueOf(t, out["due"]); d["date"] != dayOffset(1) || d["time"] != "09:00" || d["tz"] != "Asia/Tokyo" {
		t.Fatalf("rolled due = %v, want tomorrow 09:00 Asia/Tokyo", d)
	}
}
