package httpapi

import "testing"

// A label created in a workspace through REST (issue 1222): an agent token
// passes workspace_id (id or name) to create_label, a session sends it as a
// label field, and a workspace that is not the caller's is refused.
func TestLabelCreateInWorkspace(t *testing.T) {
	e, _, secret, c := agentReady(t)
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "VPC"})
	e.mustStatus(resp, 201, out)
	vpc := out["id"].(string)

	resp, out = c.do("POST", "/api/v1/labels", map[string]any{"name": "hofer", "workspace_id": "VPC"}, bearer(secret)...)
	c.mustStatus(resp, 201, out)
	if out["workspace_id"] != vpc {
		t.Fatalf("agent label = %v, want workspace %s", out, vpc)
	}
	// The same name in the default workspace is another label.
	resp, def := c.do("POST", "/api/v1/labels", map[string]any{"name": "hofer"}, bearer(secret)...)
	c.mustStatus(resp, 201, def)
	if def["id"] == out["id"] || def["workspace_id"] != nil {
		t.Fatalf("default label = %v (VPC's is %v)", def, out["id"])
	}
	// Again in VPC: the existing label, 200.
	resp, again := c.do("POST", "/api/v1/labels", map[string]any{"name": "Hofer", "workspace_id": vpc}, bearer(secret)...)
	c.mustStatus(resp, 200, again)
	if again["id"] != out["id"] {
		t.Fatalf("again = %v, want %v", again["id"], out["id"])
	}
	resp, bad := c.do("POST", "/api/v1/labels", map[string]any{"name": "x", "workspace_id": "Acme"}, bearer(secret)...)
	if resp.StatusCode != 400 || errCode(bad) != "invalid_input" {
		t.Fatalf("unknown workspace: %d %v", resp.StatusCode, bad)
	}

	resp, s := e.do("POST", "/api/v1/labels", map[string]any{"name": "vulcano", "workspace_id": vpc})
	e.mustStatus(resp, 201, s)
	if s["workspace_id"] != vpc {
		t.Fatalf("session label = %v", s)
	}
}
