package httpapi

import (
	"strings"
	"testing"
	"time"
)

// TestFlowModeREST (OpenSpec change project-flow-modes, task 6.1): projects and
// sections accept and return flow_mode from the closed set, refuse anything else
// naming the field, and keep the role and authentication rules of their other fields.
func TestFlowModeREST(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Move house", "flow_mode": "sequential"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	if out["flow_mode"] != "sequential" {
		t.Fatalf("created project = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/projects/"+pid, map[string]any{"flow_mode": "area"})
	e.mustStatus(resp, 200, out)
	if out["flow_mode"] != "area" {
		t.Fatalf("patched project = %v", out)
	}
	// A project created without it reads the default "".
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Plain"})
	e.mustStatus(resp, 201, out)
	if v, has := out["flow_mode"]; !has || v != "" {
		t.Fatalf("default project flow = %v (present %v)", v, has)
	}

	for _, body := range []map[string]any{{"flow_mode": "serial"}, {"flow_mode": ""}, {"flow_mode": 3}} {
		resp, out = e.do("PATCH", "/api/v1/projects/"+pid, body)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" || !strings.Contains(errMessage(out), "flow_mode") {
			t.Fatalf("%v: %v", body, out)
		}
	}
	resp, out = e.do("GET", "/api/v1/projects/"+pid, nil)
	e.mustStatus(resp, 200, out)
	if out["flow_mode"] != "area" {
		t.Fatalf("a refused patch changed the project: %v", out)
	}

	// Sections: "", parallel and sequential; "area" is refused.
	resp, out = e.do("POST", "/api/v1/sections", map[string]any{"name": "Prepare", "project_id": pid, "flow_mode": "parallel"})
	e.mustStatus(resp, 201, out)
	sid := out["id"].(string)
	if out["flow_mode"] != "parallel" {
		t.Fatalf("created section = %v", out)
	}
	for _, v := range []string{"sequential", ""} {
		resp, out = e.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"flow_mode": v})
		e.mustStatus(resp, 200, out)
		if out["flow_mode"] != v {
			t.Fatalf("patched section = %v", out)
		}
	}
	for _, v := range []string{"area", "staged"} {
		resp, out = e.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"flow_mode": v})
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" || !strings.Contains(errMessage(out), "flow_mode") {
			t.Fatalf("section %q: %v", v, out)
		}
	}
	resp, out = e.do("POST", "/api/v1/sections", map[string]any{"name": "Later", "project_id": pid, "flow_mode": "area"})
	e.mustStatus(resp, 400, out)

	// Unauthenticated: 401, nothing written.
	anon := newClientFor(e)
	resp, out = anon.do("PATCH", "/api/v1/projects/"+pid, map[string]any{"flow_mode": "parallel"})
	anon.mustStatus(resp, 401, out)
	if errCode(out) != "unauthorized" {
		t.Fatalf("anonymous patch = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/projects/"+pid, nil)
	e.mustStatus(resp, 200, out)
	if out["flow_mode"] != "area" {
		t.Fatalf("an anonymous patch changed the project: %v", out)
	}
}

// TestFlowModeRoles: in a shared project the owner and admins change the
// project's flow, editors only a section's, viewers neither; sync keeps any
// string so a newer client's value survives.
func TestFlowModeRoles(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	se.share(se.alice, "carol@example.com", "viewer")
	p := "/api/v1/projects/" + se.project
	resp, out := se.alice.do("POST", "/api/v1/sections", map[string]any{"name": "Prepare", "project_id": se.project})
	se.alice.mustStatus(resp, 201, out)
	sid := out["id"].(string)

	resp, out = se.bob.do("PATCH", p, map[string]any{"flow_mode": "sequential"})
	se.bob.mustStatus(resp, 403, out)
	resp, out = se.bob.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"flow_mode": "sequential"})
	se.bob.mustStatus(resp, 200, out)
	resp, out = se.carol.do("PATCH", "/api/v1/sections/"+sid, map[string]any{"flow_mode": "parallel"})
	se.carol.mustStatus(resp, 403, out)
	resp, out = se.carol.do("PATCH", p, map[string]any{"flow_mode": "area"})
	se.carol.mustStatus(resp, 403, out)
	resp, out = se.alice.do("PATCH", p, map[string]any{"flow_mode": "sequential"})
	se.alice.mustStatus(resp, 200, out)

	// The sync endpoint accepts any string (a newer client's value is kept).
	// Stamped after the REST write above, so it wins by last-writer-wins whatever the clocks.
	op := syncOp("op-flow-1", "project", se.project, "flow_mode", "staged")
	op["ts"] = time.Now().Add(time.Minute).UnixMilli()
	syncOnce(se.alice, "dev-a", 0, []map[string]any{op})
	resp, out = se.alice.do("GET", p, nil)
	se.alice.mustStatus(resp, 200, out)
	if out["flow_mode"] != "staged" {
		t.Fatalf("synced unknown flow = %v", out["flow_mode"])
	}
}
