package cli

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"
	"time"
)

// TestTodayClosedList (OpenSpec change today-closed-list, task 4.2): with a
// Today limit `ot today` prints the slots, then "Waiting for a slot" and the
// waiting tasks in fill order; --all drops the heading; --json carries
// waiting_for_slot on each task.
func TestTodayClosedList(t *testing.T) {
	h := newHarness(t)
	h.login()
	day := map[string]any{"date": "2026-10-10"}
	h.put("task", "aaaa0001", map[string]any{"title": "First", "due": day, "created_at": 1000})
	h.put("task", "bbbb0001", map[string]any{"title": "Second", "due": day, "created_at": 2000})
	h.put("task", "cccc0001", map[string]any{"title": "Third", "due": day, "created_at": 3000})

	// No limit: one list, the API's shape.
	if out := h.mustRun("today"); strings.Contains(out, "Waiting for a slot") {
		t.Fatalf("no limit:\n%s", out)
	}
	if out := h.mustRun("today", "--json"); strings.Contains(out, "waiting_for_slot") {
		t.Fatalf("no limit --json: %s", out)
	}

	h.putPersonal("user_prefs", map[string]any{"today_limit": 2})
	out := h.mustRun("today")
	head := strings.Index(out, "Waiting for a slot")
	if head < 0 || strings.Index(out, "First") > head || strings.Index(out, "Second") > head || strings.Index(out, "Third") < head {
		t.Fatalf("ot today with a limit of 2:\n%s", out)
	}
	if all := h.mustRun("today", "--all"); strings.Contains(all, "Waiting for a slot") || !strings.Contains(all, "Third") {
		t.Fatalf("ot today --all:\n%s", all)
	}
	var list []map[string]any
	if err := json.Unmarshal([]byte(h.mustRun("today", "--json")), &list); err != nil {
		t.Fatal(err)
	}
	waits := map[string]any{}
	for _, e := range list {
		waits[e["id"].(string)] = e["waiting_for_slot"]
	}
	if waits["aaaa0001"] != false || waits["bbbb0001"] != false || waits["cccc0001"] != true {
		t.Fatalf("waiting_for_slot = %v", waits)
	}

	// Taking a slot (on a device) lets Third in; Second waits.
	h.putPersonal("review", map[string]any{"slots_date": "2026-10-10", "slots": "cccc0001"})
	out = h.mustRun("today")
	if head = strings.Index(out, "Waiting for a slot"); head < 0 || strings.Index(out, "Second") < head || strings.Index(out, "Third") > head {
		t.Fatalf("after Take a slot:\n%s", out)
	}
}

// TestTodayTimeSensitive (OpenSpec change today-waiting-time-sensitive, task
// 3.2): the Waiting heading names the next task with a time today and lists
// those tasks soonest first, the table keeps fill order, and --json marks
// time_sensitive on waiting tasks.
func TestTodayTimeSensitive(t *testing.T) {
	h := newHarness(t)
	h.login()
	day := "2026-10-10"
	h.put("task", "aaaa0002", map[string]any{"title": "Planned", "due": map[string]any{"date": day}, "created_at": 1000})
	h.put("task", "bbbb0002", map[string]any{"title": "Send the form", "due": map[string]any{"date": day, "time": "16:00"}, "created_at": 2000})
	h.put("task", "cccc0002", map[string]any{"title": "Plain", "due": map[string]any{"date": day}, "created_at": 3000})
	h.put("task", "dddd0002", map[string]any{"title": "File the taxes", "due": map[string]any{"date": day}, "deadline": day, "created_at": 4000})
	h.put("task", "eeee0002", map[string]any{"title": "Call the school", "due": map[string]any{"date": day, "time": "09:00"}, "created_at": 5000})
	h.putPersonal("user_prefs", map[string]any{"today_limit": 1})

	out := h.mustRun("today")
	if !strings.Contains(out, "Waiting for a slot · 4 — next: Call the school, 09:00") {
		t.Fatalf("heading:\n%s", out)
	}
	call, form, taxes := strings.Index(out, "09:00     eeee"), strings.Index(out, "16:00     bbbb"), strings.Index(out, "deadline  dddd")
	if call < 0 || form < call || taxes < form {
		t.Fatalf("soonest first:\n%s", out)
	}
	// The table after it keeps fill order: Send the form, Plain, File the taxes, Call the school.
	table := out[taxes:]
	if i, j := strings.Index(table, "Plain"), strings.LastIndex(table, "Call the school"); i < 0 || j < i {
		t.Fatalf("fill order:\n%s", out)
	}
	var list []map[string]any
	if err := json.Unmarshal([]byte(h.mustRun("today", "--json")), &list); err != nil {
		t.Fatal(err)
	}
	got := map[string]any{}
	for _, e := range list {
		got[e["id"].(string)] = e["time_sensitive"]
	}
	if got["aaaa0002"] != nil || got["bbbb0002"] != true || got["cccc0002"] != false || got["dddd0002"] != true || got["eeee0002"] != true {
		t.Fatalf("time_sensitive = %v", got)
	}
}

// putPersonal writes fields of a personal row (user_prefs, review), which have
// no created_at or position.
func (h *harness) putPersonal(entity string, fields map[string]any) {
	h.t.Helper()
	ts := time.Now().UnixMilli()
	ops := []map[string]any{}
	for f, v := range fields {
		ops = append(ops, map[string]any{"id": entity + "/" + f + "/" + strconv.FormatInt(ts, 10), "entity": entity, "entityId": "me", "field": f, "value": v, "ts": ts, "device": "seed"})
	}
	h.apiJSON("POST", "/api/v1/sync", map[string]any{"device": "seed", "cursor": 0, "ops": ops})
}

// TestAddDone:`ot add --done` logs a win, created completed in one request;
// --repeat and --remind are usage errors that create nothing.
func TestAddDone(t *testing.T) {
	h := newHarness(t)
	h.login()
	id := strings.TrimSpace(h.mustRun("add", "--done", "Fixed the printer"))
	task := h.task(id)
	if task["completed_at"] == nil || task["completed_by"] == nil {
		t.Fatalf("win = %v", task)
	}
	if out := h.mustRun("list", "--completed"); !strings.Contains(out, "Fixed the printer") {
		t.Fatalf("ot list --completed:\n%s", out)
	}
	for _, args := range [][]string{
		{"add", "--done", "Stretch", "--repeat", "every day"},
		{"add", "--done", "Call mum", "--remind", "at 9"},
	} {
		if code, _, errb := h.run(args...); code != ExitUsage || !strings.Contains(errb, "--done") {
			t.Fatalf("ot %v: exit %d, %s", args, code, errb)
		}
	}
	for _, e := range h.apiJSON("GET", "/api/v1/tasks", nil)["tasks"].([]any) {
		if title := e.(map[string]any)["title"]; title == "Stretch" || title == "Call mum" {
			t.Fatalf("a refused win was created: %v", e)
		}
	}
}
