package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// routines-shared 3.1: the routes of a shared project's routines.
func TestSharedRoutineRoutes(t *testing.T) {
	e := rulesEnv(t, nil)
	e.server.rules.Routine = e.server.inbox
	bob, bobID := e.member("bob@example.com", "10.0.0.2")
	carol, _ := e.member("carol@example.com", "10.0.0.3")
	dave, _ := e.member("dave@example.com", "10.0.0.4")
	home := e.create("/api/v1/projects", map[string]any{"name": "Household"})
	mine := e.create("/api/v1/projects", map[string]any{"name": "Mine"})
	addByEmail(e, bob, "/api/v1/projects/"+home+"/members", "bob@example.com", "editor")
	addByEmail(e, carol, "/api/v1/projects/"+home+"/members", "carol@example.com", "viewer")
	e.create("/api/v1/tasks", map[string]any{"title": "Dishes", "project_id": home})
	steps := []any{
		map[string]any{"id": "a", "kind": "find_tasks", "in": map[string]any{"condition": map[string]any{"literal": map[string]any{}}}},
		map[string]any{"id": "b", "kind": "change_tasks", "in": map[string]any{"tasks": map[string]any{"ref": "a"}, "set": map[string]any{"literal": map[string]any{"priority": 1}}}},
	}
	// An editor creates a routine of the project; it runs as bob.
	resp, out := bob.do("POST", "/api/v1/rules", map[string]any{"name": "Chores", "trigger": map[string]any{"kind": "manual"}, "steps": steps, "project_id": home})
	bob.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if ra, _ := out["run_as"].(map[string]any); ra["id"] != bobID {
		t.Fatalf("run_as %v", out["run_as"])
	}
	// Refused at save: another project in the condition or a step. A personal step is a warning.
	for _, bad := range []map[string]any{
		{"name": "x", "trigger": map[string]any{"kind": "manual"}, "project_id": home, "condition": map[string]any{"project": map[string]any{"in": []string{mine}}}, "steps": steps},
		{"name": "x", "trigger": map[string]any{"kind": "manual"}, "project_id": home, "steps": []any{
			map[string]any{"id": "a", "kind": "create_tasks", "in": map[string]any{"title": map[string]any{"literal": "x"}, "project": map[string]any{"literal": map[string]any{"project": mine}}}}}},
	} {
		resp, out := e.do("POST", "/api/v1/rules", bad)
		e.mustStatus(resp, 400, out)
		if !strings.Contains(out["error"].(map[string]any)["message"].(string), "only in its project") {
			t.Fatalf("refusal %v", out)
		}
	}
	resp, out = bob.do("POST", "/api/v1/rules", map[string]any{"name": "Focus", "trigger": map[string]any{"kind": "manual"}, "project_id": home, "steps": []any{
		map[string]any{"id": "a", "kind": "find_tasks", "in": map[string]any{"condition": map[string]any{"literal": map[string]any{}}}},
		map[string]any{"id": "b", "kind": "set_focus", "in": map[string]any{"tasks": map[string]any{"ref": "a"}}}}})
	bob.mustStatus(resp, 201, out)
	if w, _ := out["warnings"].([]any); len(w) != 1 || w[0].(map[string]any)["reason"] != "not_in_shared" {
		t.Fatalf("warnings %v", out["warnings"])
	}
	// A viewer cannot change it, run it or undo its runs; a stranger does not see it.
	resp, out = carol.do("PATCH", "/api/v1/rules/"+id, map[string]any{"name": "Mine now"})
	if resp.StatusCode < 400 {
		t.Fatalf("viewer edit %d %v", resp.StatusCode, out)
	}
	resp, out = carol.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "c-1"})
	carol.mustStatus(resp, http.StatusForbidden, out)
	resp, out = dave.do("GET", "/api/v1/rules/"+id+"/runs", nil)
	dave.mustStatus(resp, http.StatusNotFound, out)
	// The owner runs it now: as herself.
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "o-1"})
	e.mustStatus(resp, 200, out)
	run := out["run"].(map[string]any)
	if run["outcome"] != "applied" || run["project_id"] != home {
		t.Fatalf("run %v", run)
	}
	runID := run["run_id"].(string)
	// Every member sees the run; carol cannot undo it, bob can.
	for _, m := range []*env{e, bob, carol} {
		resp, out = m.do("GET", "/api/v1/rules/"+id+"/runs/"+runID, nil)
		m.mustStatus(resp, 200, out)
		resp, out = m.do("GET", "/api/v1/me/rules/runs", nil)
		m.mustStatus(resp, 200, out)
		if len(out["runs"].([]any)) != 1 {
			t.Fatalf("runs %v", out)
		}
	}
	resp, out = dave.do("GET", "/api/v1/rules/"+id+"/runs/"+runID, nil)
	dave.mustStatus(resp, http.StatusNotFound, out)
	resp, out = carol.do("POST", "/api/v1/rules/"+id+"/runs/"+runID+"/undo", nil)
	carol.mustStatus(resp, http.StatusForbidden, out)
	resp, out = bob.do("POST", "/api/v1/rules/"+id+"/runs/"+runID+"/undo", nil)
	bob.mustStatus(resp, 200, out)
	// Unauthenticated: 401.
	anon := newClientAt(e, "10.0.0.9")
	resp, out = anon.do("GET", "/api/v1/rules/"+id+"/runs", nil)
	anon.mustStatus(resp, http.StatusUnauthorized, out)
	// Bob becomes a viewer: the routine running as him pauses and the owner is told.
	resp, out = e.do("PATCH", "/api/v1/projects/"+home+"/members/"+bobID, map[string]any{"role": "viewer"})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/me/rules", nil)
	e.mustStatus(resp, 200, out)
	if st := out["rules"].(map[string]any)[id].(map[string]any); st["paused_reason"] != "run_as_viewer" {
		t.Fatalf("status %v", st)
	}
	resp, out = e.do("GET", "/api/v1/notifications", nil)
	e.mustStatus(resp, 200, out)
	if b, _ := json.Marshal(out); !strings.Contains(string(b), "routine_paused_shared") {
		t.Fatalf("notifications %v", out)
	}
}
