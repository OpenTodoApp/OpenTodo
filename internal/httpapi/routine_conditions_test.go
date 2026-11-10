package httpapi

import (
	"strings"
	"testing"
)

// routine-conditions: a routine's workspace and the "is not" tests through
// REST and the MCP routine tools, with their validation.
func TestRoutineWorkspaceAndConditionsRoutes(t *testing.T) {
	e := rulesEnv(t, nil)
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	triage := e.create("/api/v1/projects", map[string]any{"name": "Triage", "workspace_id": work})

	// "Project is none" with a default project, limited to Work.
	id := e.create("/api/v1/rules", map[string]any{"name": "Default project", "trigger": map[string]any{"kind": "task.created"},
		"condition": map[string]any{"project": "none", "priority": map[string]any{"not_in": []int{1}}},
		"actions":   map[string]any{"section": map[string]any{"project_id": triage, "section_id": nil}}, "workspace_id": work})
	resp, out = e.do("GET", "/api/v1/rules/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["workspace_id"] != work {
		t.Fatalf("workspace_id %v", out["workspace_id"])
	}
	// Every workspace again.
	resp, out = e.do("PATCH", "/api/v1/rules/"+id, map[string]any{"workspace_id": nil})
	e.mustStatus(resp, 200, out)

	// A workspace that is not the user's, and a malformed "is not", are refused.
	for name, body := range map[string]map[string]any{
		"not mine":  {"workspace_id": "someone-elses"},
		"empty":     {"workspace_id": ""},
		"both":      {"condition": map[string]any{"project": map[string]any{"in": []string{triage}, "not_in": []string{triage}}}},
		"no ids":    {"condition": map[string]any{"section": map[string]any{"not_in": []string{}}}},
		"priority5": {"condition": map[string]any{"priority": map[string]any{"not_in": []int{5}}}},
	} {
		resp, out := e.do("PATCH", "/api/v1/rules/"+id, body)
		if resp.StatusCode != 400 {
			t.Errorf("%s: %d %v", name, resp.StatusCode, out)
		}
	}

	// The draft test plans inside the workspace.
	resp, out = e.do("POST", "/api/v1/rules/test", map[string]any{"trigger": map[string]any{"kind": "manual"}, "workspace_id": work,
		"steps": []any{map[string]any{"id": "a", "kind": "find_tasks", "in": map[string]any{"condition": map[string]any{"literal": map[string]any{"project": map[string]any{"not_in": []string{triage}}}}}}}})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("POST", "/api/v1/rules/test", map[string]any{"trigger": map[string]any{"kind": "manual"}, "workspace_id": "gone",
		"steps": []any{map[string]any{"id": "a", "kind": "date", "in": map[string]any{}}}})
	if resp.StatusCode != 400 {
		t.Fatalf("draft in a workspace not the user's: %d %v", resp.StatusCode, out)
	}
}

func TestRoutineWorkspaceMCPTools(t *testing.T) {
	e := rulesEnv(t, nil)
	e.allowWrites(true)
	e.allowMyAssistants(true)
	_, secret := e.namedToken("Desk assistant", "agent")
	c := e.bearerClient()
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	created := c.mustTool(secret, "create_routine", map[string]any{"name": "Default", "trigger": `{"kind":"task.created"}`, "condition": `{"project":"none"}`,
		"actions": `{"priority":2}`, "workspace": "work"})
	id := created["results"].([]any)[0].(map[string]any)["id"].(string)
	got := c.mustTool(secret, "get_routine", map[string]any{"routine": id})
	if got["routine"].(map[string]any)["workspace_id"] != work {
		t.Fatalf("get_routine %v", got)
	}
	c.mustTool(secret, "update_routine", map[string]any{"routine": id, "workspace": nil})
	got = c.mustTool(secret, "get_routine", map[string]any{"routine": id})
	if got["routine"].(map[string]any)["workspace_id"] != nil {
		t.Fatalf("every workspace: %v", got)
	}
	if msg := e.rpcArgError(secret, "update_routine", map[string]any{"routine": id, "workspace": "Acme"}); !strings.Contains(msg, "Work") {
		t.Fatalf("unknown workspace %q", msg)
	}
}
