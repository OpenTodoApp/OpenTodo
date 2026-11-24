package httpapi

import (
	"net/http"
	"strings"
	"testing"
)

// Feature switches per workspace (OpenSpec change workspace-feature-switches,
// task 1.3): PATCH merges per key, an unknown key is refused, a member cannot
// switch, an anonymous request gets 401, a demo 403, and members read the map in
// their sync response.

func featuresOf(t *testing.T, ws map[string]any) map[string]any {
	t.Helper()
	f, ok := ws["features"].(map[string]any)
	if !ok {
		t.Fatalf("workspace without a features object: %v", ws)
	}
	return f
}

func TestWorkspaceFeaturesPatch(t *testing.T) {
	se := newShareEnv(t)
	ws := createWorkspace(se.alice, "Family")
	addByEmail(se.alice, se.bob, "/api/v1/workspaces/"+ws+"/members", "bob@example.com", "admin")
	addByEmail(se.alice, se.carol, "/api/v1/workspaces/"+ws+"/members", "carol@example.com", "member")
	path := "/api/v1/workspaces/" + ws

	resp, out := se.alice.do("GET", path, nil)
	se.alice.mustStatus(resp, 200, out)
	if f := featuresOf(t, out); len(f) != 0 {
		t.Fatalf("new workspace features = %v, want {}", f)
	}
	resp, out = se.alice.do("PATCH", path, map[string]any{"features": map[string]any{"habits": false}})
	se.alice.mustStatus(resp, 200, out)
	resp, out = se.bob.do("PATCH", path, map[string]any{"features": map[string]any{"focus": false}})
	se.bob.mustStatus(resp, 200, out)
	if f := featuresOf(t, out); f["habits"] != false || f["focus"] != false || len(f) != 2 || out["name"] != "Family" {
		t.Fatalf("merged = %v", out)
	}

	// A member cannot switch; a typo is refused by name and stores nothing.
	resp, out = se.carol.do("PATCH", path, map[string]any{"features": map[string]any{"habits": true}})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("PATCH", path, map[string]any{"features": map[string]any{"habit": true, "focus": true}})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "habit") {
		t.Fatalf("unknown key = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("PATCH", path, map[string]any{"features": map[string]any{"habits": "no"}})
	if resp.StatusCode != 400 {
		t.Fatalf("non-boolean = %d %v", resp.StatusCode, out)
	}
	anon := newClientAt(se.alice, "10.0.7.9")
	resp, out = anon.do("PATCH", path, map[string]any{"features": map[string]any{"habits": true}})
	if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous = %d %v", resp.StatusCode, out)
	}

	// Carol's device reads the map with the workspace in its sync response.
	resp, out = se.carol.do("POST", "/api/v1/sync", map[string]any{"device": "c1", "cursor": 0, "ops": []any{}})
	se.carol.mustStatus(resp, 200, out)
	var family map[string]any
	for _, w := range out["workspaces"].([]any) {
		if m := w.(map[string]any); m["id"] == ws {
			family = m
		}
	}
	if family == nil {
		t.Fatalf("Family missing from the sync response: %v", out["workspaces"])
	}
	if f := featuresOf(t, family); f["habits"] != false || f["focus"] != false || f["notes"] != nil {
		t.Fatalf("synced features = %v", f)
	}
}

// TestWorkspaceFeaturesDefaultWorkspace: the default workspace's owner switches
// its features like any other.
func TestWorkspaceFeaturesDefaultWorkspace(t *testing.T) {
	e := newShareEnv(t).alice
	resp, out := e.do("GET", "/api/v1/workspaces", nil)
	e.mustStatus(resp, 200, out)
	def := out["workspaces"].([]any)[0].(map[string]any)
	if featuresOf(t, def); def["default"] != true {
		t.Fatalf("first workspace = %v", def)
	}
	resp, out = e.do("PATCH", "/api/v1/workspaces/"+def["id"].(string), map[string]any{"features": map[string]any{"calendar": false}})
	e.mustStatus(resp, 200, out)
	if f := featuresOf(t, out); f["calendar"] != false {
		t.Fatalf("default features = %v", f)
	}
}

func TestWorkspaceFeaturesOnDemo(t *testing.T) {
	d := newDemoServer(t)
	visitor := d.anonymous()
	resp, out := createSandbox(visitor, token(visitor))
	visitor.mustStatus(resp, http.StatusCreated, out)
	resp, out = visitor.do("GET", "/api/v1/workspaces", nil)
	visitor.mustStatus(resp, 200, out)
	id := out["workspaces"].([]any)[0].(map[string]any)["id"].(string)
	resp, out = visitor.do("PATCH", "/api/v1/workspaces/"+id, map[string]any{"features": map[string]any{"habits": false}})
	if resp.StatusCode != 403 || errCode(out) != "demo_restricted" {
		t.Fatalf("demo = %d %v", resp.StatusCode, out)
	}
}
