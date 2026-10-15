package httpapi

import (
	"strings"
	"testing"
)

// Task dependencies over REST (OpenSpec change task-dependencies, task 1.3).
func TestTaskBlockedByOverREST(t *testing.T) {
	e := ownerEnv(t)
	mk := func(body map[string]any) string {
		resp, out := e.do("POST", "/api/v1/tasks", body)
		e.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	a := mk(map[string]any{"title": "Confirm dates"})
	b := mk(map[string]any{"title": "Book flights", "blocked_by": []string{a}})
	resp, out := e.do("GET", "/api/v1/tasks/"+b, nil)
	e.mustStatus(resp, 200, out)
	if l, _ := out["blocked_by"].([]any); len(l) != 1 || l[0] != a {
		t.Fatalf("blocked_by = %v", out["blocked_by"])
	}
	// Closing a cycle is refused and names the blocker.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+a, map[string]any{"blocked_by": []string{b}})
	e.mustStatus(resp, 400, out)
	if msg := out["error"].(map[string]any)["message"].(string); !strings.Contains(msg, b) {
		t.Fatalf("message %q", msg)
	}
	// A blocker in another sharing scope is refused.
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Shared"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	e.member("member@example.com", "198.51.100.9")
	resp, out = e.do("POST", "/api/v1/projects/"+pid+"/members", map[string]any{"email": "member@example.com", "role": "editor"})
	e.mustStatus(resp, 201, out)
	c := mk(map[string]any{"title": "Team task", "project_id": pid})
	resp, out = e.do("PATCH", "/api/v1/tasks/"+c, map[string]any{"blocked_by": []string{a}})
	e.mustStatus(resp, 400, out)
	if code := out["error"].(map[string]any)["code"]; code != "invalid_input" {
		t.Fatalf("code %v", code)
	}
	// Patching to an empty list unblocks.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+b, map[string]any{"blocked_by": []string{}})
	e.mustStatus(resp, 200, out)
	anon := newEnv(t, false)
	if resp, _ := anon.raw("PATCH", "/api/v1/tasks/"+b, []byte(`{"blocked_by":[]}`)); resp.StatusCode != 401 {
		t.Fatalf("anonymous = %d", resp.StatusCode)
	}
}
