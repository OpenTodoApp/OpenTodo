package httpapi

import (
	"strings"
	"testing"
)

// Task origin on the API (OpenSpec change task-origin, "Task origin on the
// API" and "Task origin in representations").

var issueOrigin = map[string]any{"kind": "issue", "provider": "github", "id": "o/r#7", "url": "https://github.com/o/r/issues/7"}

func sameOrigin(got any, want map[string]any) bool {
	m, ok := got.(map[string]any)
	if !ok || len(m) != len(want) {
		return false
	}
	for k, v := range want {
		if m[k] != v {
			return false
		}
	}
	return true
}

func TestTaskOriginOnTheAPI(t *testing.T) {
	e := ownerEnv(t)
	secret := e.token("full")
	c := e.bearerClient()
	resp, out := c.do("POST", "/api/v1/tasks", map[string]any{"title": "Fix the login timeout", "origin": issueOrigin}, bearer(secret)...)
	c.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if !sameOrigin(out["origin"], issueOrigin) {
		t.Fatalf("create response origin = %v", out["origin"])
	}
	resp, out = c.do("GET", "/api/v1/tasks/"+id, nil, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if !sameOrigin(out["origin"], issueOrigin) {
		t.Fatalf("read origin = %v", out["origin"])
	}

	before := countOps(t, e)
	resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"origin": map[string]any{"kind": "url", "url": "file:///etc/passwd"}}, bearer(secret)...)
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(errMessage(out), "origin") {
		t.Fatalf("file: origin = %d %v", resp.StatusCode, out)
	}
	if countOps(t, e) != before {
		t.Fatal("a refused patch wrote")
	}

	resp, out = e.bearerClient().do("PATCH", "/api/v1/tasks/"+id, map[string]any{"origin": nil})
	if resp.StatusCode != 401 {
		t.Fatalf("anonymous patch = %d %v", resp.StatusCode, out)
	}
	resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"origin": nil}, bearer(e.token("read"))...)
	if resp.StatusCode != 403 {
		t.Fatalf("read token patch = %d %v", resp.StatusCode, out)
	}
	resp, out = c.do("GET", "/api/v1/tasks/"+id, nil, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if !sameOrigin(out["origin"], issueOrigin) {
		t.Fatalf("origin changed by a refused patch: %v", out["origin"])
	}

	resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"origin": nil}, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if out["origin"] != nil || out["title"] != "Fix the login timeout" {
		t.Fatalf("cleared = %v", out)
	}
}

// TestObsidianOriginOnTheAPI covers obsidian-origin "Origin validation": a note
// link on an obsidian origin is accepted unchanged, another Obsidian action is
// refused with the error envelope and writes nothing.
func TestObsidianOriginOnTheAPI(t *testing.T) {
	e := ownerEnv(t)
	secret := e.token("full")
	c := e.bearerClient()
	resp, out := c.do("POST", "/api/v1/tasks", map[string]any{"title": "Follow up on the kick-off"}, bearer(secret)...)
	c.mustStatus(resp, 201, out)
	id := out["id"].(string)

	note := map[string]any{"kind": "obsidian", "id": "Meetings/Kick-off.md", "url": "obsidian://open?vault=Work%20notes&file=Meetings%2FKick-off"}
	resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"origin": note}, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if !sameOrigin(out["origin"], note) {
		t.Fatalf("obsidian origin = %v", out["origin"])
	}

	before := countOps(t, e)
	for _, bad := range []map[string]any{
		{"kind": "obsidian", "id": "x.md", "url": "obsidian://new?vault=Notes&name=x"},
		{"kind": "obsidian", "id": "Daily/2026-10-29.md", "url": "obsidian://open?vault=Notes&file=Private%2Fdiary"},
		{"kind": "url", "url": "obsidian://open?vault=Notes&file=a"},
	} {
		resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"origin": bad}, bearer(secret)...)
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(errMessage(out), "origin") {
			t.Fatalf("%v: %d %v", bad, resp.StatusCode, out)
		}
	}
	if countOps(t, e) != before {
		t.Fatal("a refused patch wrote")
	}
	resp, out = c.do("GET", "/api/v1/tasks/"+id, nil, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if !sameOrigin(out["origin"], note) {
		t.Fatalf("origin changed by a refused patch: %v", out["origin"])
	}
}

func TestAgentTokenSetsOrigin(t *testing.T) {
	e, _, secret, c := agentReady(t)
	resp, out := c.do("POST", "/api/v1/tasks", map[string]any{"title": "Filed by the assistant", "origin": issueOrigin}, bearer(secret)...)
	c.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if !sameOrigin(out["origin"], issueOrigin) {
		t.Fatalf("agent origin = %v", out["origin"])
	}
	resp, out = c.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"origin": nil}, bearer(secret)...)
	c.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["origin"] != nil {
		t.Fatalf("agent clear = %v", out["origin"])
	}
}

func TestExportCarriesOrigin(t *testing.T) {
	e := ownerEnv(t)
	email := map[string]any{"kind": "email", "id": "<a1@mail.example>"}
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "From email", "origin": email})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Plain"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	seen := 0
	for _, raw := range out["tasks"].([]any) {
		task := raw.(map[string]any)
		origin, has := task["origin"]
		switch task["title"] {
		case "From email":
			if !sameOrigin(origin, email) {
				t.Fatalf("email origin = %v", origin)
			}
			seen++
		case "Plain":
			if !has || origin != nil {
				t.Fatalf("plain task origin = %v (present %v)", origin, has)
			}
			seen++
		}
	}
	if seen != 2 {
		t.Fatalf("export tasks = %v", out["tasks"])
	}
}
