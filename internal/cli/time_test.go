package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Time commands (OpenSpec change time-tracking, task 11.1).
func TestTimeCommands(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	h.seedViews()
	schemas := loadSchemas(t)
	// "Start then stop".
	out := h.mustRun("time", "start", "plum")
	if !strings.HasPrefix(out, "Started ") || !strings.Contains(out, "Call the plumber") {
		t.Fatalf("start = %q", out)
	}
	// "Running entry": exactly that entry, endedAt null.
	out = h.mustRun("time", "list", "--running", "--json")
	mustMatch(t, schemas, "time list", out, arrayOf("time_entry"))
	var running []map[string]any
	_ = json.Unmarshal([]byte(out), &running)
	if len(running) != 1 || running[0]["endedAt"] != nil || running[0]["taskId"] != "plum0001" {
		t.Fatalf("running = %s", out)
	}
	out = h.mustRun("time", "stop", "--json")
	mustMatch(t, schemas, "time stop", out, ref("time_entry"))
	if !strings.Contains(out, `"endedAt":`) || strings.Contains(out, `"endedAt":null`) {
		t.Fatalf("stop = %s", out)
	}
	// "Nothing running": exit 1 with the server's message.
	if code, _, errb := h.run("time", "stop"); code != ExitServer || !strings.Contains(errb, "no time entry is running") {
		t.Fatalf("nothing running: %d %q", code, errb)
	}
	// "Log past work": 90 minutes ending at 17:00 yesterday, with the note.
	id := strings.TrimSpace(h.mustRun("time", "log", "plum", "1h30", "--on", "yesterday", "--note", "review"))
	out = h.mustRun("time", "list", "--task", "plum", "--json")
	var list []map[string]any
	_ = json.Unmarshal([]byte(out), &list)
	var logged map[string]any
	for _, e := range list {
		if e["id"] == id {
			logged = e
		}
	}
	end := time.Date(2026, 10, 9, 17, 0, 0, 0, time.Local).UnixMilli()
	if logged == nil || logged["note"] != "review" || logged["minutes"] != float64(90) || int64(logged["endedAt"].(float64)) != end {
		t.Fatalf("logged = %v (want end %d)", logged, end)
	}
	h.mustRun("time", "log", "rent", "--from", "09:00", "--to", "09:25", "--on", "2026-10-08")
	// "Invalid duration": exit 2 before any request, naming the forms.
	h.requestLog()
	if code, _, errb := h.run("time", "log", "plum", "soon"); code != ExitUsage || !strings.Contains(errb, "45m, 1h30 or 90") {
		t.Fatalf("invalid duration: %d %q", code, errb)
	}
	if code, _, _ := h.run("time", "log", "plum", "--from", "10:00", "--to", "09:00"); code != ExitUsage {
		t.Fatalf("to before from: %d", code)
	}
	if reqs := h.requestLog(); len(reqs) != 0 {
		t.Fatalf("invalid input sent requests: %v", reqs)
	}
	// "List this week": the range in local days, newest first, with the span.
	out = h.mustRun("time", "list", "--from", "2026-10-05", "--to", "2026-10-11")
	if !strings.Contains(out, "2026-10-08") || !strings.Contains(out, "09:00–09:25") || !strings.Contains(out, "25m") ||
		!strings.Contains(out, "Pay rent") || !strings.Contains(out, "Home") || strings.Index(out, "2026-10-09") > strings.Index(out, "2026-10-08") {
		t.Fatalf("list = %q", out)
	}
	// "Export to a file": the server's CSV, --json reports file and rows.
	file := filepath.Join(t.TempDir(), "week.csv")
	out = h.mustRun("time", "export", "--from", "2026-10-05", "--to", "2026-10-11", "-o", file, "--json")
	mustMatch(t, schemas, "time export", out, ref("export_file"))
	var rep map[string]any
	_ = json.Unmarshal([]byte(out), &rep)
	csv, _ := os.ReadFile(file)
	if rep["file"] != file || rep["rows"] != float64(2) || !strings.HasPrefix(string(csv), "\ufeffdate,start,end,minutes,task,project,labels,note") {
		t.Fatalf("export = %v %q", rep, csv)
	}
}

// putEntry writes time entry fields through the sync endpoint (h.put adds
// fields a time entry does not have).
func putEntry(h *harness, id string, fields map[string]any) {
	h.t.Helper()
	ts := time.Now().UnixMilli()
	ops := []map[string]any{}
	for f, v := range fields {
		ops = append(ops, map[string]any{"id": id + "/" + f + "/" + strconv.FormatInt(ts, 10), "entity": "time_entry", "entityId": id, "field": f, "value": v, "ts": ts, "device": "seed"})
	}
	h.apiJSON("POST", "/api/v1/sync", map[string]any{"device": "seed", "cursor": 0, "ops": ops})
}

// ot time status (OpenSpec change focus-session-readable, task 3.4).
func TestTimeStatus(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	h.seedViews()
	schemas := loadSchemas(t)
	if out := h.mustRun("time", "status"); strings.TrimSpace(out) != "Nothing running." {
		t.Fatalf("nothing running = %q", out)
	}
	uid := h.apiJSON("GET", "/api/v1/me", nil)["user"].(map[string]any)["id"].(string)
	start := time.Date(2026, 10, 10, 10, 0, 0, 0, time.Local)
	end := start.Add(25 * time.Minute)
	putEntry(h, "focus001", map[string]any{"task_id": "plum0001", "user_id": uid, "started_at": start.UnixMilli(), "ended_at": nil,
		"device_id": "laptop", "note": "", "focus_mode": "pomodoro", "focus_session": 3, "planned_end_at": end.UnixMilli()})
	out := h.mustRun("time", "status")
	if !strings.Contains(out, "Running focus001") || !strings.Contains(out, "since 10:00") || !strings.Contains(out, "Call the plumber") ||
		!strings.Contains(out, "Pomodoro, session 3, ends 10:25") {
		t.Fatalf("status = %q", out)
	}
	out = h.mustRun("time", "status", "--json")
	mustMatch(t, schemas, "time status", out, ref("time_running"))
	var res map[string]any
	_ = json.Unmarshal([]byte(out), &res)
	focus := res["entry"].(map[string]any)["focus"].(map[string]any)
	if focus["mode"] != "pomodoro" || focus["session"] != float64(3) || int64(focus["plannedEndAt"].(float64)) != end.UnixMilli() {
		t.Fatalf("status --json = %s", out)
	}
	// A read token reads it too; a Flowtime session has no end.
	_, secret := h.apiToken2("read")
	h.setToken(secret)
	putEntry(h, "focus001", map[string]any{"focus_mode": "flowtime", "focus_session": 0, "planned_end_at": nil})
	if out := h.mustRun("time", "status"); !strings.Contains(out, "Flowtime") || strings.Contains(out, "ends") || strings.Contains(out, "session") {
		t.Fatalf("flowtime = %q", out)
	}
}

func TestTimeCommandsReadToken(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	h.seedViews()
	_, secret := h.apiToken2("read")
	h.setToken(secret)
	h.requestLog()
	code, out, _ := h.run("time", "start", "plum", "--json")
	if code != ExitNotPermitted || !strings.Contains(out, "insufficient_scope") {
		t.Fatalf("read token start: %d %q", code, out)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("read token sent writes: %v", w)
	}
	h.mustRun("time", "list")
	h.mustRun("time", "export")
}

func TestAddNaturalSpent(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	// "Spent and estimate from the line": two planned requests, nothing created.
	out := h.mustRun("add", "--natural", "Draft the offer 30m/2h", "--dry-run", "--json")
	var plan struct {
		Requests []plannedRequest
	}
	_ = json.Unmarshal([]byte(out), &plan)
	if len(plan.Requests) != 2 || plan.Requests[0].Path != "/api/v1/tasks" || plan.Requests[1].Path != "/api/v1/time-entries" {
		t.Fatalf("plan = %s", out)
	}
	task := plan.Requests[0].Body.(map[string]any)
	entry := plan.Requests[1].Body.(map[string]any)
	if task["estimate_minutes"] != float64(120) || task["title"] != "Draft the offer" || entry["taskId"] != "(planned-1)" ||
		entry["endedAt"].(float64)-entry["startedAt"].(float64) != 30*60000 {
		t.Fatalf("task %v entry %v", task, entry)
	}
	if n := len(h.apiJSON("GET", "/api/v1/tasks", nil)["tasks"].([]any)); n != 0 {
		t.Fatalf("a dry run created %d tasks", n)
	}
	// For real, with a key: a retry converges to one entry.
	h.mustRun("add", "--natural", "Draft the offer 30m/2h", "--idempotency-key", "offer-1")
	h.mustRun("add", "--natural", "Draft the offer 30m/2h", "--idempotency-key", "offer-1")
	out = h.mustRun("time", "list", "--json")
	var list []map[string]any
	_ = json.Unmarshal([]byte(out), &list)
	if len(list) != 1 || list[0]["minutes"] != float64(30) {
		t.Fatalf("entries = %s", out)
	}
}
