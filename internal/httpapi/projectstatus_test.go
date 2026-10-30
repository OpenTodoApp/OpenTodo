package httpapi

import (
	"strings"
	"testing"
	"time"
)

// TestProjectStatusREST (OpenSpec change project-review-cadence, task 4.1):
// projects accept and return status (active or maintenance), refuse any other
// value naming the field, and keep the authentication rule of their other fields.
func TestProjectStatusREST(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden", "status": "maintenance"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	if out["status"] != "maintenance" {
		t.Fatalf("created project = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/projects/"+pid, map[string]any{"status": "active"})
	e.mustStatus(resp, 200, out)
	if out["status"] != "active" {
		t.Fatalf("patched project = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/projects/"+pid, map[string]any{"status": "maintenance"})
	e.mustStatus(resp, 200, out)
	// A project created without it reads as active.
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Plain"})
	e.mustStatus(resp, 201, out)
	if out["status"] != "active" {
		t.Fatalf("default project status = %v", out["status"])
	}

	for _, body := range []map[string]any{{"status": "paused"}, {"status": ""}, {"status": 1}, {"status": nil}} {
		resp, out = e.do("PATCH", "/api/v1/projects/"+pid, body)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" || !strings.Contains(errMessage(out), "status") {
			t.Fatalf("%v: %v", body, out)
		}
	}
	resp, out = e.do("GET", "/api/v1/projects/"+pid, nil)
	e.mustStatus(resp, 200, out)
	if out["status"] != "maintenance" {
		t.Fatalf("a refused patch changed the project: %v", out)
	}

	// Unauthenticated: 401, nothing written.
	anon := newClientFor(e)
	resp, out = anon.do("PATCH", "/api/v1/projects/"+pid, map[string]any{"status": "active"})
	anon.mustStatus(resp, 401, out)
	if errCode(out) != "unauthorized" {
		t.Fatalf("anonymous patch = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/projects/"+pid, nil)
	e.mustStatus(resp, 200, out)
	if out["status"] != "maintenance" {
		t.Fatalf("an anonymous patch changed the project: %v", out)
	}
}

// TestProjectStatusRoles: in a shared project the owner and admins change the
// status, editors and viewers get 403; sync keeps any string so a newer
// client's value survives.
func TestProjectStatusRoles(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	se.share(se.alice, "carol@example.com", "viewer")
	p := "/api/v1/projects/" + se.project

	resp, out := se.bob.do("PATCH", p, map[string]any{"status": "maintenance"})
	se.bob.mustStatus(resp, 403, out)
	resp, out = se.carol.do("PATCH", p, map[string]any{"status": "maintenance"})
	se.carol.mustStatus(resp, 403, out)
	resp, out = se.alice.do("PATCH", p, map[string]any{"status": "maintenance"})
	se.alice.mustStatus(resp, 200, out)
	// Every member reads the same shared status.
	resp, out = se.bob.do("GET", p, nil)
	se.bob.mustStatus(resp, 200, out)
	if out["status"] != "maintenance" {
		t.Fatalf("editor reads status %v", out["status"])
	}

	op := syncOp("op-status-1", "project", se.project, "status", "on-hold")
	op["ts"] = time.Now().Add(time.Minute).UnixMilli()
	syncOnce(se.alice, "dev-a", 0, []map[string]any{op})
	resp, out = se.alice.do("GET", p, nil)
	se.alice.mustStatus(resp, 200, out)
	if out["status"] != "on-hold" {
		t.Fatalf("synced unknown status = %v", out["status"])
	}
}
