package httpapi

import (
	"testing"
)

// syncOps posts ops through the sync endpoint as device dev.
func (e *env) syncOps(dev string, ops ...map[string]any) map[string]any {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": dev, "cursor": 0, "ops": ops})
	e.mustStatus(resp, 200, out)
	return out
}

func rop(id, entity, entityID, field string, value any, ts int64) map[string]any {
	return map[string]any{"id": id, "entity": entity, "entityId": entityID, "field": field, "value": value, "ts": ts, "device": "devA"}
}

func TestExportIncludesReminders(t *testing.T) {
	e := ownerEnv(t)
	e.syncOps("devA",
		rop("o1", "task", "t1", "title", "Call the dentist", 1),
		rop("o2", "reminder", "r1", "task_id", "t1", 1),
		rop("o3", "reminder", "r1", "kind", "absolute", 1),
		rop("o4", "reminder", "r1", "fire_at", 1_791_000_000_000, 1),
		rop("o5", "reminder", "r2", "task_id", "t1", 1),
		rop("o6", "reminder", "r2", "deleted_at", 5, 1),
	)
	resp, out := e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	list, ok := out["reminders"].([]any)
	if !ok || len(list) != 2 {
		t.Fatalf("export reminders = %v", out["reminders"])
	}
	// REST reads see reminders as a collection too; the tombstoned one is hidden.
	resp, out = e.do("GET", "/api/v1/reminders", nil)
	e.mustStatus(resp, 200, out)
	if l := out["reminders"].([]any); len(l) != 1 || l[0].(map[string]any)["kind"] != "absolute" {
		t.Fatalf("GET /reminders = %v", out)
	}
	// Invalid values are rejected as invalid ops.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "devA", "cursor": 0, "ops": []any{rop("bad", "reminder", "r3", "kind", "weekly", 2)}})
	e.mustStatus(resp, 400, out)
}

// TestExportIncludesUserPrefs (date-time-preferences D1): the export carries the
// caller's own date and time preferences row, and only theirs.
func TestExportIncludesUserPrefs(t *testing.T) {
	e := ownerEnv(t)
	e.syncOps("devA",
		rop("p1", "user_prefs", "me", "date_format", "iso", 1),
		rop("p2", "user_prefs", "me", "time_format", "24h", 1),
		rop("p3", "user_prefs", "me", "theme_accent", "violet", 1),
	)
	resp, out := e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	list, ok := out["user_prefs"].([]any)
	if !ok || len(list) != 1 {
		t.Fatalf("export user_prefs = %v", out["user_prefs"])
	}
	row := list[0].(map[string]any)
	if row["id"] != "me" || row["date_format"] != "iso" || row["time_format"] != "24h" || row["theme_accent"] != "violet" {
		t.Fatalf("exported row = %v", row)
	}
}
