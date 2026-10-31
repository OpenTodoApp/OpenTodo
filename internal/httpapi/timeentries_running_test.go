package httpapi

import (
	"encoding/json"
	"testing"
	"time"
)

// The running entry route and the Focus details on entries (OpenSpec change
// focus-session-readable, design D3).

// focusEntryOps are the sync ops of a running Focus entry on task.
func focusEntryOps(id, task, user string, start int64, mode string, session int, plannedEnd any) []map[string]any {
	ts := time.Now().UnixMilli()
	op := func(field string, v any) map[string]any {
		return map[string]any{"id": id + "-" + field, "entity": "time_entry", "entityId": id, "field": field, "value": v, "ts": ts, "device": "laptop"}
	}
	return []map[string]any{
		op("task_id", task), op("user_id", user), op("started_at", start), op("ended_at", nil), op("device_id", "laptop"),
		op("note", ""), op("created_at", start), op("focus_mode", mode), op("focus_session", session), op("planned_end_at", plannedEnd),
	}
}

func TestRunningTimeEntryRoute(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	anon := newClientFor(se.alice)
	// "Anonymous request": 401.
	resp, out := anon.do("GET", "/api/v1/time-entries/running", nil)
	if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous: %d %v", resp.StatusCode, out)
	}
	// "Nothing running": 200 with entry null and the server time.
	resp, out = se.bob.do("GET", "/api/v1/time-entries/running", nil)
	se.bob.mustStatus(resp, 200, out)
	if v, ok := out["entry"]; !ok || v != nil || out["serverTime"] == nil {
		t.Fatalf("nothing running = %v", out)
	}
	// Bob's third Pomodoro on the shared task, written by his device.
	start := time.Now().Add(-5 * time.Minute).UnixMilli()
	end := start + 25*60000
	syncOnce(se.bob, "laptop", 0, focusEntryOps("fe1", se.task, se.ids["bob"], start, "pomodoro", 3, end))
	// "A panel reads the session": a read token.
	secret := se.bob.token("read")
	c := se.bob.bearerClient()
	resp, out = c.do("GET", "/api/v1/time-entries/running", nil, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	entry, _ := out["entry"].(map[string]any)
	focus, _ := entry["focus"].(map[string]any)
	if entry["id"] != "fe1" || entry["taskTitle"] != "Milk" || entry["endedAt"] != nil || focus == nil ||
		focus["mode"] != "pomodoro" || focus["session"] != float64(3) || focus["plannedEndAt"] != float64(end) {
		t.Fatalf("running = %v", out)
	}
	// "Another member's running entry": alice reads the task's entries but
	// the route never answers with bob's.
	resp, out = se.alice.do("GET", "/api/v1/time-entries/running", nil)
	se.alice.mustStatus(resp, 200, out)
	if out["entry"] != nil {
		t.Fatalf("alice got bob's entry: %v", out)
	}
	// The list routes carry the same focus object.
	resp, out = se.alice.do("GET", "/api/v1/time-entries?running=true", nil)
	se.alice.mustStatus(resp, 200, out)
	list := out["entries"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["focus"].(map[string]any)["mode"] != "pomodoro" {
		t.Fatalf("running list = %v", out)
	}
	// "Plain timer": an entry from the Start button has focus null.
	resp, out = se.alice.do("POST", "/api/v1/time-entries", map[string]any{"taskId": se.task})
	se.alice.mustStatus(resp, 201, out)
	if v, ok := out["focus"]; !ok || v != nil {
		t.Fatalf("plain entry focus = %v", out)
	}
	resp, out = se.alice.do("GET", "/api/v1/time-entries/running", nil)
	se.alice.mustStatus(resp, 200, out)
	if e, _ := out["entry"].(map[string]any); e == nil || e["focus"] != nil || e["userId"] != se.ids["alice"] {
		t.Fatalf("alice's own running = %v", out)
	}
	// "Wrong method": 405 with the envelope, nothing written.
	before := countOps(t, se.alice)
	resp, out = se.alice.do("POST", "/api/v1/time-entries/running", map[string]any{})
	if resp.StatusCode != 405 || errCode(out) == "" {
		t.Fatalf("POST: %d %v", resp.StatusCode, out)
	}
	if countOps(t, se.alice) != before {
		t.Fatal("POST wrote ops")
	}
	// The JSON export carries the three fields.
	resp, out = se.bob.do("GET", "/api/v1/export", nil)
	se.bob.mustStatus(resp, 200, out)
	found := false
	for _, x := range out["time_entries"].([]any) {
		if m := x.(map[string]any); m["id"] == "fe1" {
			found = m["focus_mode"] == "pomodoro" && m["focus_session"] == float64(3) && m["planned_end_at"] == float64(end)
		}
	}
	if !found {
		t.Fatalf("export lacks the focus fields: %v", out["time_entries"])
	}
}

// A Flowtime entry has no planned end; a pause (the entry ended) reads as
// nothing running.
func TestRunningTimeEntryFlowtimeAndPause(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Write"})
	e.mustStatus(resp, 201, out)
	task := out["id"].(string)
	resp, me := e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, me)
	uid := me["user"].(map[string]any)["id"].(string)
	start := time.Now().Add(-time.Minute).UnixMilli()
	syncOnce(e, "laptop", 0, focusEntryOps("fl1", task, uid, start, "flowtime", 0, nil))
	resp, out = e.do("GET", "/api/v1/time-entries/running", nil)
	e.mustStatus(resp, 200, out)
	focus := out["entry"].(map[string]any)["focus"].(map[string]any)
	if focus["mode"] != "flowtime" || focus["session"] != float64(0) || focus["plannedEndAt"] != nil {
		t.Fatalf("flowtime = %v", focus)
	}
	syncOnce(e, "laptop", 0, []map[string]any{syncOp("pause", "time_entry", "fl1", "ended_at", time.Now().UnixMilli())})
	resp, out = e.do("GET", "/api/v1/time-entries/running", nil)
	e.mustStatus(resp, 200, out)
	if out["entry"] != nil {
		t.Fatalf("paused = %v", out)
	}
}

// runningResource reads opentodo://time-entries/running over MCP.
func (e *env) runningResource(secret string) map[string]any {
	e.t.Helper()
	out := e.rpc(secret, "resources/read", map[string]any{"uri": "opentodo://time-entries/running"})
	var payload map[string]any
	text := out["result"].(map[string]any)["contents"].([]any)[0].(map[string]any)["text"].(string)
	if err := json.Unmarshal([]byte(text), &payload); err != nil {
		e.t.Fatalf("resource text %q: %v", text, err)
	}
	return payload
}

// MCP: the running entry resource and the focus object, with the projects
// kept away from assistants left out (focus-session-readable D4).
func TestRunningTimeEntryResource(t *testing.T) {
	e, _, secret, _ := agentReady(t)
	resp, me := e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, me)
	uid := me["user"].(map[string]any)["id"].(string)
	if p := e.runningResource(secret); p["entry"] != nil || p["server_time"] == nil {
		t.Fatalf("nothing running = %v", p)
	}
	task := e.newTask(map[string]any{"title": "Write the report"})
	start := time.Now().Add(-time.Minute).UnixMilli()
	end := start + 25*60000
	syncOnce(e, "laptop", 0, focusEntryOps("r1", task, uid, start, "pomodoro", 3, end))
	// "Assistant reads the session".
	p := e.runningResource(secret)
	entry, _ := p["entry"].(map[string]any)
	focus, _ := entry["focus"].(map[string]any)
	wantEnd := time.UnixMilli(end).UTC().Format(time.RFC3339)
	if entry["id"] != "r1" || entry["untrusted_text"].(map[string]any)["task"] != "Write the report" || focus == nil ||
		focus["mode"] != "pomodoro" || focus["session"] != float64(3) || focus["planned_end_at"] != wantEnd {
		t.Fatalf("resource = %v", p)
	}
	list := e.mustTool(secret, "list_time_entries", map[string]any{"running": true})["time_entries"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["focus"].(map[string]any)["planned_end_at"] != wantEnd {
		t.Fatalf("list = %v", list)
	}
	// "Plain timer": focus null.
	resp, out := e.do("POST", "/api/v1/time-entries", map[string]any{"taskId": task})
	e.mustStatus(resp, 201, out)
	if p := e.runningResource(secret); p["entry"].(map[string]any)["focus"] != nil {
		t.Fatalf("plain = %v", p)
	}
	// "Session on an excluded project": null, and the list leaves it out.
	pid := e.newProject(map[string]any{"name": "Client X"})
	hidden := e.newTask(map[string]any{"title": "Zanzibar", "project_id": pid})
	e.keepAway(pid, true)
	syncOnce(e, "laptop", 0, focusEntryOps("r2", hidden, uid, time.Now().UnixMilli(), "countdown", 0, time.Now().Add(40*time.Minute).UnixMilli()))
	resp, out = e.do("POST", "/api/v1/time-entries/stop", nil)
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/time-entries/running", nil)
	e.mustStatus(resp, 200, out)
	if out["entry"] != nil {
		t.Fatalf("stop left an entry running: %v", out)
	}
	syncOnce(e, "laptop", 0, focusEntryOps("r3", hidden, uid, time.Now().UnixMilli(), "countdown", 0, time.Now().Add(40*time.Minute).UnixMilli()))
	if p := e.runningResource(secret); p["entry"] != nil {
		t.Fatalf("excluded = %v", p)
	}
	for _, it := range e.mustTool(secret, "list_time_entries", map[string]any{})["time_entries"].([]any) {
		if id := it.(map[string]any)["id"]; id == "r2" || id == "r3" {
			t.Fatalf("listed excluded entry %v", it)
		}
	}
}
