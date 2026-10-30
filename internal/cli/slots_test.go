package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

func (h *harness) seedSlot() string {
	h.t.Helper()
	out := h.apiJSON("POST", "/api/v1/slots", map[string]any{"title": "Errands", "date": "2026-11-04", "start": "16:00", "minutes": 45})
	id, _ := out["id"].(string)
	if id == "" {
		h.t.Fatalf("seed slot: %v", out)
	}
	return id
}

// "Put tasks from the CLI" (calendar-slots "Slots API"): both tasks are added to
// the slot and dated to its day as one batch.
func TestSlotsCommands(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	id := strings.TrimSpace(h.mustRun("slots", "add", "Admin", "--date", "2026-11-04", "--at", "16:00", "--for", "45m"))
	if s := h.apiJSON("GET", "/api/v1/slots/"+id, nil); s["title"] != "Admin" || s["date"] != "2026-11-04" || s["minutes"].(float64) != 45 {
		t.Fatalf("slot %v", s)
	}
	t1 := h.apiJSON("POST", "/api/v1/tasks", map[string]any{"title": "Reply to Marco", "due": map[string]any{"date": "2026-11-06", "time": "10:00"}})["id"].(string)
	t2 := h.apiJSON("POST", "/api/v1/tasks", map[string]any{"title": "Pay invoice"})["id"].(string)
	if out := h.mustRun("slots", "put", id[:6], t1, t2[:8]); !strings.Contains(out, "2 tasks") {
		t.Fatalf("put %q", out)
	}
	for _, tid := range []string{t1, t2} {
		due, _ := h.apiJSON("GET", "/api/v1/tasks/"+tid, nil)["due"].(map[string]any)
		if due["date"] != "2026-11-04" || due["time"] != nil {
			t.Fatalf("task %s due %v", tid, due)
		}
	}
	if table := h.mustRun("slots", "--from", "2026-11-01", "--to", "2026-11-07"); !strings.Contains(table, "Admin") || !strings.Contains(table, "16:00-16:45") {
		t.Fatalf("table %q", table)
	}
	var list []map[string]any
	if err := json.Unmarshal([]byte(h.mustRun("slots", "list", "--json")), &list); err != nil || len(list) != 1 || len(list[0]["task_ids"].([]any)) != 2 {
		t.Fatalf("list %v %v", list, err)
	}
	if code, _, _ := h.run("slots", "add", "Bad", "--for", "10m"); code == 0 {
		t.Fatal("10-minute slot accepted")
	}
	if out := h.mustRun("slots", "rm", id[:6], "--yes"); !strings.Contains(out, "deleted") {
		t.Fatalf("rm %q", out)
	}
	if out := h.mustRun("slots"); !strings.Contains(out, "No slots.") {
		t.Fatalf("after rm %q", out)
	}
}
