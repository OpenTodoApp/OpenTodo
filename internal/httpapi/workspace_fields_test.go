package httpapi

import (
	"strings"
	"testing"
)

// Workspace fields (OpenSpec change workspace-fields): a field without a
// project, defined by a workspace's owner, applies to every project of the
// workspace for that owner.

func defaultWorkspaceID(t *testing.T, c *env) string {
	t.Helper()
	resp, out := c.do("GET", "/api/v1/workspaces", nil)
	c.mustStatus(resp, 200, out)
	for _, x := range out["workspaces"].([]any) {
		if m := x.(map[string]any); m["default"] == true {
			return m["id"].(string)
		}
	}
	t.Fatal("no default workspace")
	return ""
}

func TestWorkspaceFields(t *testing.T) {
	se := newShareEnv(t)
	alice := se.alice
	def := defaultWorkspaceID(t, alice)
	work := createWorkspace(alice, "Work")
	addByEmail(alice, se.bob, "/api/v1/workspaces/"+work+"/members", "bob@example.com", "admin")
	post := func(c *env, path string, body map[string]any, status int) map[string]any {
		t.Helper()
		resp, out := c.do("POST", path, body)
		c.mustStatus(resp, status, out)
		return out
	}
	kitchen := post(alice, "/api/v1/projects", map[string]any{"name": "Kitchen"}, 201)["id"].(string)
	office := post(alice, "/api/v1/projects", map[string]any{"name": "Office", "workspace_id": work}, 201)["id"].(string)
	post(alice, "/api/v1/fields", map[string]any{"name": "Size", "type": "number", "project_id": kitchen}, 201)

	// Scenario "Create a workspace field via the API".
	client := post(alice, "/api/v1/fields", map[string]any{"name": "Client", "type": "text", "workspace_id": def}, 201)
	if client["workspace_id"] != def || (client["project_id"] != nil && client["project_id"] != "") {
		t.Fatalf("workspace field = %v", client)
	}
	clientID := client["id"].(string)

	for i, c := range []struct {
		who  *env
		body map[string]any
		want string
	}{
		{alice, map[string]any{"name": "X", "type": "text", "workspace_id": def, "project_id": kitchen}, "not both"},
		{alice, map[string]any{"name": "X", "type": "text", "workspace_id": "nope"}, "unknown workspace"},
		{alice, map[string]any{"name": "client", "type": "text", "workspace_id": def}, "workspace already has a field"},
		{alice, map[string]any{"name": "size", "type": "number", "workspace_id": def}, `project "Kitchen" already has a field named "Size"`},
		{alice, map[string]any{"name": "CLIENT", "type": "text", "project_id": kitchen}, `from the workspace "Personal"`},
		{se.bob, map[string]any{"name": "Stage", "type": "text", "workspace_id": work}, "only the workspace's owner"},
	} {
		resp, out := c.who.do("POST", "/api/v1/fields", c.body)
		c.who.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" || !strings.Contains(out["error"].(map[string]any)["message"].(string), c.want) {
			t.Fatalf("case %d: %v, want %q", i, out, c.want)
		}
	}

	// A task of every project in the workspace takes a value; another workspace's does not.
	task := post(alice, "/api/v1/tasks", map[string]any{"title": "Tiles", "project_id": kitchen}, 201)["id"].(string)
	resp, out := alice.do("PATCH", "/api/v1/tasks/"+task, map[string]any{"fields": map[string]any{clientID: "Acme"}})
	alice.mustStatus(resp, 200, out)
	if out["fields"].(map[string]any)[clientID] != "Acme" {
		t.Fatalf("task = %v", out)
	}
	other := post(alice, "/api/v1/tasks", map[string]any{"title": "Desk", "project_id": office}, 201)["id"].(string)
	resp, out = alice.do("PATCH", "/api/v1/tasks/"+other, map[string]any{"fields": map[string]any{clientID: "Acme"}})
	alice.mustStatus(resp, 400, out)

	// workspace_id never changes; a rename keeps the workspace's rules.
	resp, out = alice.do("PATCH", "/api/v1/fields/"+clientID, map[string]any{"workspace_id": work})
	alice.mustStatus(resp, 400, out)
	resp, out = alice.do("PATCH", "/api/v1/fields/"+clientID, map[string]any{"name": "Size"})
	alice.mustStatus(resp, 400, out)
	resp, out = alice.do("PATCH", "/api/v1/fields/"+clientID, map[string]any{"name": "Customer"})
	alice.mustStatus(resp, 200, out)

	// Bob, an admin of Work, sees none of alice's workspace fields.
	resp, out = se.bob.do("GET", "/api/v1/fields", nil)
	se.bob.mustStatus(resp, 200, out)
	if n := len(out["fields"].([]any)); n != 0 {
		t.Fatalf("bob sees %v", out)
	}

	// Scenario "Unauthenticated request".
	anon := newClientAt(alice, "10.9.9.8")
	resp, out = anon.do("POST", "/api/v1/fields", map[string]any{"name": "X", "type": "text", "workspace_id": def})
	anon.mustStatus(resp, 401, out)
}

func TestWorkspaceFieldsLimit(t *testing.T) {
	e := ownerEnv(t)
	def := defaultWorkspaceID(t, e)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Kitchen"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	for i := 0; i < 29; i++ {
		resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "F" + string(rune('A'+i)), "type": "text", "project_id": pid})
		e.mustStatus(resp, 201, out)
	}
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "Last", "type": "text", "workspace_id": def})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "More", "type": "text", "workspace_id": def})
	e.mustStatus(resp, 400, out)
	if !strings.Contains(out["error"].(map[string]any)["message"].(string), `project "Kitchen" would have more than 30`) {
		t.Fatalf("limit = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "More", "type": "text", "project_id": pid})
	e.mustStatus(resp, 400, out)
}
