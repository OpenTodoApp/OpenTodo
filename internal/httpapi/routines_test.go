package httpapi

import (
	"strings"
	"testing"
	"time"
)

// routines-engine 3.1: the routine routes.
func TestRoutineRoutes(t *testing.T) {
	e := rulesEnv(t, nil)
	project := e.create("/api/v1/projects", map[string]any{"name": "Errands"})
	steps := []any{
		map[string]any{"id": "a", "kind": "split_lines", "in": map[string]any{"text": map[string]any{"literal": "oat milk\nbread"}}},
		map[string]any{"id": "b", "kind": "create_tasks", "in": map[string]any{"text": map[string]any{"ref": "a"}, "project": map[string]any{"literal": map[string]any{"project": project}}}},
		map[string]any{"id": "c", "kind": "count", "in": map[string]any{"list": map[string]any{"ref": "b"}}},
	}
	// "Create a routine through the API".
	resp, out := e.do("POST", "/api/v1/rules", map[string]any{"name": "Groceries", "trigger": map[string]any{"kind": "manual"}, "actions": nil, "steps": steps})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if len(out["steps"].([]any)) != 3 || out["paused_reason"] != nil || out["actions"] != nil {
		t.Fatalf("created %v", out)
	}
	// A legacy rule reads steps: null.
	legacy := e.create("/api/v1/rules", map[string]any{"name": "P1", "trigger": map[string]any{"kind": "task.created"}, "actions": map[string]any{"priority": 1}})
	resp, out = e.do("GET", "/api/v1/rules/"+legacy, nil)
	e.mustStatus(resp, 200, out)
	if _, has := out["steps"]; !has || out["steps"] != nil || out["paused_reason"] != nil {
		t.Fatalf("legacy %v", out)
	}
	// Neither actions nor steps; a wrong type; a project that does not exist.
	for _, bad := range []map[string]any{
		{"name": "x", "trigger": map[string]any{"kind": "manual"}, "actions": nil, "steps": nil},
		{"name": "x", "trigger": map[string]any{"kind": "manual"}, "steps": []any{
			map[string]any{"id": "a", "kind": "find_tasks", "in": map[string]any{"condition": map[string]any{"literal": map[string]any{"due": "today"}}}},
			map[string]any{"id": "b", "kind": "notify", "in": map[string]any{"text": map[string]any{"ref": "a"}}}}},
		{"name": "x", "trigger": map[string]any{"kind": "manual"}, "steps": []any{
			map[string]any{"id": "a", "kind": "create_tasks", "in": map[string]any{"title": map[string]any{"literal": "x"}, "project": map[string]any{"literal": map[string]any{"project": "nope"}}}}}},
	} {
		resp, out := e.do("POST", "/api/v1/rules", bad)
		e.mustStatus(resp, 400, out)
		if bad["steps"] != nil && len(bad["steps"].([]any)) == 2 && !strings.Contains(out["error"].(map[string]any)["message"].(string), "notify: text expects Text, got Tasks") {
			t.Fatalf("type error %v", out)
		}
	}
	// Test, then run, then the same request again.
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "r-1", "test": true})
	e.mustStatus(resp, 200, out)
	if out["writes"] != float64(2) || out["test"] != true {
		t.Fatalf("test run %v", out)
	}
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "r-2"})
	e.mustStatus(resp, 200, out)
	run := out["run"].(map[string]any)
	runID := run["run_id"].(string)
	if run["outcome"] != "applied" || run["source"] != "manual" || len(run["steps"].([]any)) != 3 {
		t.Fatalf("run %v", run)
	}
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "r-2"})
	e.mustStatus(resp, 200, out)
	if out["run"].(map[string]any)["run_id"] != runID {
		t.Fatalf("retried %v", out)
	}
	resp, out = e.do("GET", "/api/v1/rules/"+id+"/runs/"+runID, nil)
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/me/rules/runs?outcome=applied", nil)
	e.mustStatus(resp, 200, out)
	// The logged test run is listed too, marked test.
	if list := out["runs"].([]any); len(list) != 2 || list[1].(map[string]any)["test"] != true {
		t.Fatalf("all runs %v", out)
	}
	// Undo, then twice.
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/runs/"+runID+"/undo", nil)
	e.mustStatus(resp, 200, out)
	if out["restored"] != float64(2) {
		t.Fatalf("undo %v", out)
	}
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/runs/"+runID+"/undo", nil)
	e.mustStatus(resp, 409, out)
	if errCode(out) != "already_undone" {
		t.Fatalf("twice %v", out)
	}
	// A routine reading the trigger's task needs task_id.
	needs := e.create("/api/v1/rules", map[string]any{"name": "Follow up", "trigger": map[string]any{"kind": "task.created"}, "actions": nil, "steps": []any{
		map[string]any{"id": "a", "kind": "change_tasks", "in": map[string]any{"tasks": map[string]any{"ref": "trigger"}, "set": map[string]any{"literal": map[string]any{"priority": 1}}}}}})
	resp, out = e.do("POST", "/api/v1/rules/"+needs+"/run", map[string]any{"run_id": "r-3"})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "task_required" {
		t.Fatalf("task_required %v", out)
	}
	// The draft test writes nothing; an unknown kind is refused naming the step.
	resp, out = e.do("POST", "/api/v1/rules/test", map[string]any{"trigger": map[string]any{"kind": "manual"}, "steps": steps})
	e.mustStatus(resp, 200, out)
	if out["writes"] != float64(2) {
		t.Fatalf("draft %v", out)
	}
	resp, out = e.do("POST", "/api/v1/rules/test", map[string]any{"trigger": map[string]any{"kind": "manual"}, "steps": []any{map[string]any{"id": "a", "kind": "fetch_url"}}})
	e.mustStatus(resp, 400, out)
	// The catalogue: no outgoing email, no webhook.
	resp, out = e.do("GET", "/api/v1/me/rules/catalogue", nil)
	e.mustStatus(resp, 200, out)
	kinds := map[string]map[string]any{}
	for _, s := range out["steps"].([]any) {
		k := s.(map[string]any)
		kinds[k["kind"].(string)] = k
	}
	if kinds["email_me"]["available"] != false || kinds["email_me"]["reason"] != "email_not_configured" || kinds["webhook"]["reason"] != "no_webhook" || kinds["notify"]["available"] != true {
		t.Fatalf("catalogue %v %v", kinds["email_me"], kinds["webhook"])
	}
	// Tokens: read and agent tokens are refused on the run route.
	for _, scope := range []string{"read", "agent"} {
		secret := e.token(scope)
		c := e.bearerClient()
		resp, out := c.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "r-" + scope}, bearer(secret)...)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("%s token: %d %v", scope, resp.StatusCode, out)
		}
	}
	// Another user's run is not found; the unauthenticated are refused.
	m, _ := e.member("member@example.com", "203.0.113.9")
	resp, out = m.do("GET", "/api/v1/rules/"+id+"/runs/"+runID, nil)
	m.mustStatus(resp, 404, out)
	anon := newClientAt(e, "203.0.113.10")
	for _, p := range []string{"/api/v1/rules/" + id + "/run", "/api/v1/rules/test", "/api/v1/rules/" + id + "/runs/" + runID + "/undo"} {
		resp, out := anon.do("POST", p, map[string]any{})
		anon.mustStatus(resp, 401, out)
	}
	for _, p := range []string{"/api/v1/me/rules/runs", "/api/v1/me/rules/catalogue"} {
		resp, out := anon.do("GET", p, nil)
		anon.mustStatus(resp, 401, out)
	}
}

// "Rate": a 61st run within one minute is refused and not queued.
func TestRoutineRunRate(t *testing.T) {
	e := rulesEnv(t, nil)
	// The limit counts runs per clock minute; the 61 runs happen within one,
	// 30 seconds before its end, however long they take on a busy runner (a
	// real clock crossed a minute on CI and let the 61st run through).
	base, start := time.Now().Truncate(time.Minute).Add(30*time.Second), time.Now()
	e.server.rules.SetClock(func() time.Time { return base.Add(time.Since(start)) })
	id := e.create("/api/v1/rules", map[string]any{"name": "Tick", "trigger": map[string]any{"kind": "manual"}, "steps": []any{
		map[string]any{"id": "a", "kind": "create_tasks", "in": map[string]any{"title": map[string]any{"literal": "x"}}}}})
	for i := range 60 {
		resp, out := e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "r" + string(rune('A'+i%26)) + string(rune('a'+i/26))})
		e.mustStatus(resp, 200, out)
	}
	resp, out := e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "last"})
	e.mustStatus(resp, 429, out)
	if errCode(out) != "rate_limited" {
		t.Fatalf("rate %v", out)
	}
}
