package mcp

import (
	"encoding/json"
	"testing"
)

// list_slots and opentodo://slots (OpenSpec change calendar-slots, design D9).
func TestSlotsReadToolAndResource(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "task", "a", map[string]any{"title": "Pay invoice", "due": map[string]any{"date": "2026-11-04"}, "estimate_minutes": 5})
	f.put("u1", "task", "b", map[string]any{"title": "Reply to Marco", "due": map[string]any{"date": "2026-11-04"}, "completed_at": 10})
	f.put("u1", "task", "moved", map[string]any{"title": "Moved", "due": map[string]any{"date": "2026-11-05"}})
	f.put("u1", "slot", "admin", map[string]any{"title": "Admin", "date": "2026-11-04", "start": "16:00", "minutes": 45, "color": "#64748b",
		"task_ids": []string{"b", "a", "moved", "unknown"}, "created_at": 1, "deleted_at": nil})
	// "Encrypted slot" when the title is ciphertext; a deleted slot and another account's never show.
	f.put("u1", "slot", "enc", map[string]any{"title": "enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "date": "2026-11-03", "start": "09:00", "minutes": 30, "task_ids": []string{}})
	f.put("u1", "slot", "gone", map[string]any{"title": "Old", "date": "2026-11-04", "start": "08:00", "minutes": 30, "deleted_at": 5})
	f.put("u2", "slot", "other", map[string]any{"title": "Theirs", "date": "2026-11-04", "start": "08:00", "minutes": 30})

	res := f.tool("u1", "list_slots", map[string]any{"from": "2026-11-02", "to": "2026-11-08"})
	slots := res["slots"].([]any)
	if len(slots) != 2 {
		t.Fatalf("slots = %v", slots)
	}
	if enc := slots[0].(map[string]any); enc["id"] != "enc" || ut(enc)["title"] != "Encrypted slot" {
		t.Fatalf("encrypted = %v", enc)
	}
	admin := slots[1].(map[string]any)
	tasks := admin["tasks"].([]any)
	if ut(admin)["title"] != "Admin" || admin["minutes"].(float64) != 45 || len(tasks) != 2 {
		t.Fatalf("admin = %v", admin)
	}
	if first := tasks[0].(map[string]any); first["id"] != "a" || first["done"] != false || ut(first)["title"] != "Pay invoice" {
		t.Fatalf("open first = %v", first)
	}
	if last := tasks[1].(map[string]any); last["id"] != "b" || last["done"] != true {
		t.Fatalf("done last = %v", last)
	}
	if r := f.call("u1", "tools/call", map[string]any{"name": "list_slots", "arguments": map[string]any{"from": "2026-11-01", "to": "2026-12-15"}}); !isToolError(r) {
		t.Fatalf("long range = %v", r)
	}

	r := f.call("u1", "resources/read", map[string]any{"uri": "opentodo://slots"})
	text := r["result"].(map[string]any)["contents"].([]any)[0].(map[string]any)["text"].(string)
	var payload struct {
		Slots []map[string]any `json:"slots"`
	}
	if err := json.Unmarshal([]byte(text), &payload); err != nil || payload.Slots == nil {
		t.Fatalf("resource = %s", text)
	}
}
