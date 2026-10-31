package httpapi

import (
	"testing"
	"time"
)

// The agent content routes added by OpenSpec change agent-tools-complete:
// field values, project notes, parents, icons and archiving, sections, labels,
// reminders and time entries, all through the agent tool registry.

func agentDo(t *testing.T, c *env, secret, method, path string, body any) (int, map[string]any) {
	t.Helper()
	resp, out := c.do(method, path, body, bearer(secret)...)
	return resp.StatusCode, out
}

func TestAgentRestFieldValues(t *testing.T) {
	e, _, secret, c := agentReady(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Kitchen"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	other := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "Cost", "type": "number", "project_id": pid})
	e.mustStatus(resp, 201, out)
	cost := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "Area", "type": "number", "project_id": other})
	e.mustStatus(resp, 201, out)
	area := out["id"].(string)

	st, out := agentDo(t, c, secret, "POST", "/api/v1/tasks", map[string]any{"title": "Tiles", "project_id": pid, "fields": map[string]any{cost: 120}})
	if st != 201 || out["fields"].(map[string]any)[cost] != float64(120) {
		t.Fatalf("create with fields: %d %v", st, out)
	}
	tid := out["id"].(string)
	before := countOps(t, e)
	st, out = agentDo(t, c, secret, "PATCH", "/api/v1/tasks/"+tid, map[string]any{"fields": map[string]any{cost: 150}})
	if st != 200 || out["fields"].(map[string]any)[cost] != float64(150) {
		t.Fatalf("patch fields: %d %v", st, out)
	}
	if n := countOps(t, e) - before; n != 1 {
		t.Fatalf("patch wrote %d ops, want 1", n)
	}
	var device string
	_ = e.db.QueryRow(`SELECT device FROM ops WHERE field = ? ORDER BY ts DESC LIMIT 1`, "fields."+cost).Scan(&device)
	if device[:6] != "agent:" {
		t.Fatalf("device %q", device)
	}
	for _, bad := range []map[string]any{{cost: "lots"}, {area: 3}} {
		st, out = agentDo(t, c, secret, "PATCH", "/api/v1/tasks/"+tid, map[string]any{"fields": bad})
		if st != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("bad fields %v: %d %v", bad, st, out)
		}
	}
}

func TestAgentRestProjectsSectionsLabels(t *testing.T) {
	e, _, secret, c := agentReady(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Client X"})
	e.mustStatus(resp, 201, out)
	p := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Phase 1", "parent_id": p})
	e.mustStatus(resp, 201, out)
	child := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Clients"})
	e.mustStatus(resp, 201, out)
	clients := out["id"].(string)

	// Section and note (scenario "Section and project note through REST").
	st, out := agentDo(t, c, secret, "POST", "/api/v1/sections", map[string]any{"name": "Doing", "project_id": p})
	if st != 201 || out["name"] != "Doing" {
		t.Fatalf("section: %d %v", st, out)
	}
	sec := out["id"].(string)
	st, out = agentDo(t, c, secret, "PATCH", "/api/v1/projects/"+p, map[string]any{"description": "Budget approved."})
	if st != 200 || out["description"] != "Budget approved." {
		t.Fatalf("note: %d %v", st, out)
	}
	st, out = agentDo(t, c, secret, "PATCH", "/api/v1/sections/"+sec, map[string]any{"name": "In progress", "icon": "rocket"})
	if st != 200 || out["name"] != "In progress" {
		t.Fatalf("section patch: %d %v", st, out)
	}
	// Parent and icon.
	st, out = agentDo(t, c, secret, "PATCH", "/api/v1/projects/"+p, map[string]any{"parent_id": clients, "icon": "briefcase"})
	if st != 200 || out["parent_id"] != clients || out["icon"] != "briefcase" {
		t.Fatalf("parent and icon: %d %v", st, out)
	}
	st, out = agentDo(t, c, secret, "PATCH", "/api/v1/projects/"+p, map[string]any{"parent_id": nil, "icon": nil})
	if st != 200 || out["parent_id"] != nil || out["icon"] != nil {
		t.Fatalf("clear parent and icon: %d %v", st, out)
	}
	// Archive on its own, with the sub-project.
	st, out = agentDo(t, c, secret, "PATCH", "/api/v1/projects/"+p, map[string]any{"archived": true, "name": "Old"})
	if st != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("archive mixed: %d %v", st, out)
	}
	st, out = agentDo(t, c, secret, "PATCH", "/api/v1/projects/"+p, map[string]any{"archived": true})
	if st != 200 || out["archived"] != true {
		t.Fatalf("archive: %d %v", st, out)
	}
	resp, out = e.do("GET", "/api/v1/projects/"+child, nil)
	e.mustStatus(resp, 200, out)
	if out["archived"] != true {
		t.Fatalf("sub-project not archived: %v", out)
	}
	var events int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'agent.write' AND details LIKE '%archive_projects%'`).Scan(&events)
	if events != 1 {
		t.Fatalf("%d agent.write events for archive_projects", events)
	}
	// Labels: rename through PATCH, deleting stays refused.
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "errand"})
	e.mustStatus(resp, 201, out)
	lid := out["id"].(string)
	st, out = agentDo(t, c, secret, "PATCH", "/api/v1/labels/"+lid, map[string]any{"name": "errands", "color": "#16a34a"})
	if st != 200 || out["name"] != "errands" {
		t.Fatalf("label: %d %v", st, out)
	}
	st, out = agentDo(t, c, secret, "PATCH", "/api/v1/labels/"+lid, map[string]any{"deleted_at": 1})
	if st != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("label field: %d %v", st, out)
	}
	for _, path := range []string{"/api/v1/labels/" + lid, "/api/v1/sections/" + sec} {
		if st, out := agentDo(t, c, secret, "DELETE", path, nil); st != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("DELETE %s: %d %v", path, st, out)
		}
	}
}

func TestAgentRestReminders(t *testing.T) {
	e, _, secret, c := agentReady(t)
	today := time.Now().UTC().Format("2006-01-02")
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Deep work", "due": map[string]any{"date": today, "time": "10:00"}})
	e.mustStatus(resp, 201, out)
	tid := out["id"].(string)
	st, out := agentDo(t, c, secret, "POST", "/api/v1/reminders", map[string]any{"task_id": tid, "kind": "relative", "offset_minutes": 0})
	ten, _ := time.Parse("2006-01-02 15:04", today+" 10:00")
	if st != 201 || out["fire_at"] != float64(ten.UnixMilli()) {
		t.Fatalf("reminder: %d %v", st, out)
	}
	rid := out["id"].(string)
	st, out = agentDo(t, c, secret, "PATCH", "/api/v1/reminders/"+rid, map[string]any{"offset_minutes": -15})
	if st != 200 || out["fire_at"] != float64(ten.UnixMilli()-15*60_000) {
		t.Fatalf("reminder patch: %d %v", st, out)
	}
	at := ten.Add(24 * time.Hour).UnixMilli()
	st, out = agentDo(t, c, secret, "POST", "/api/v1/reminders", map[string]any{"task_id": tid, "fire_at": at})
	if st != 201 || out["kind"] != "absolute" || out["fire_at"] != float64(at) {
		t.Fatalf("absolute reminder: %d %v", st, out)
	}
	if st, out := agentDo(t, c, secret, "DELETE", "/api/v1/reminders/"+rid, nil); st != 204 {
		t.Fatalf("delete reminder: %d %v", st, out)
	}
	if st, out := agentDo(t, c, secret, "DELETE", "/api/v1/reminders/nope", nil); st != 404 {
		t.Fatalf("foreign reminder: %d %v", st, out)
	}
	e.allowMyAssistants(false)
	if st, out := agentDo(t, c, secret, "POST", "/api/v1/reminders", map[string]any{"task_id": tid, "kind": "relative"}); st != 403 || errCode(out) != "writes_disabled_by_user" {
		t.Fatalf("switch off: %d %v", st, out)
	}
}

func TestAgentRestTimeEntries(t *testing.T) {
	e, tokenID, secret, c := agentReady(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Write the report"})
	e.mustStatus(resp, 201, out)
	task := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Task A"})
	e.mustStatus(resp, 201, out)
	a := out["id"].(string)
	// Scenario "Agent logs time".
	end := time.Now().Add(-time.Hour).UnixMilli()
	st, out := agentDo(t, c, secret, "POST", "/api/v1/time-entries", map[string]any{"taskId": task, "startedAt": end - 25*60_000, "endedAt": end, "note": "Pomodoro"})
	if st != 201 || out["minutes"] != float64(25) || out["deviceId"] != "agent:"+tokenID {
		t.Fatalf("log: %d %v", st, out)
	}
	logged := out["id"].(string)
	// The person's timer runs: starting is refused unless stopRunning.
	resp, out = e.do("POST", "/api/v1/time-entries", map[string]any{"taskId": a})
	e.mustStatus(resp, 201, out)
	person := out["id"].(string)
	st, out = agentDo(t, c, secret, "POST", "/api/v1/time-entries", map[string]any{"taskId": task})
	if st != 409 || errCode(out) != "timer_running" {
		t.Fatalf("start while running: %d %v", st, out)
	}
	resp, out = e.do("GET", "/api/v1/time-entries/running", nil)
	e.mustStatus(resp, 200, out)
	if out["entry"].(map[string]any)["id"] != person {
		t.Fatalf("the person's timer stopped: %v", out)
	}
	st, out = agentDo(t, c, secret, "POST", "/api/v1/time-entries", map[string]any{"taskId": task, "stopRunning": true})
	if st != 201 || out["endedAt"] != nil {
		t.Fatalf("takeover: %d %v", st, out)
	}
	// PATCH: own entries only.
	if st, out := agentDo(t, c, secret, "PATCH", "/api/v1/time-entries/"+person, map[string]any{"note": "x"}); st != 403 || errCode(out) != "not_permitted" {
		t.Fatalf("patch the person's entry: %d %v", st, out)
	}
	if st, out := agentDo(t, c, secret, "PATCH", "/api/v1/time-entries/"+logged, map[string]any{"note": "Pomodoro 1"}); st != 200 || out["note"] != "Pomodoro 1" {
		t.Fatalf("patch own entry: %d %v", st, out)
	}
	if st, out := agentDo(t, c, secret, "POST", "/api/v1/time-entries/stop", nil); st != 200 || out["endedAt"] == nil {
		t.Fatalf("stop: %d %v", st, out)
	}
	if st, out := agentDo(t, c, secret, "POST", "/api/v1/time-entries/stop", nil); st != 404 {
		t.Fatalf("nothing to stop: %d %v", st, out)
	}
	if st, out := agentDo(t, c, secret, "DELETE", "/api/v1/time-entries/"+logged, nil); st != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("delete: %d %v", st, out)
	}
	e.allowWrites(false)
	if st, out := agentDo(t, c, secret, "POST", "/api/v1/time-entries/stop", nil); st != 403 || errCode(out) != "writes_disabled_by_owner" {
		t.Fatalf("owner switch off: %d %v", st, out)
	}
}
