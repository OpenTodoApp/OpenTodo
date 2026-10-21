package httpapi

import (
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/audit"
)

// Projects kept away from AI assistants (OpenSpec change agent-planning-fields,
// spec agent-project-exclusion).

func (e *env) newProject(body map[string]any) string {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/projects", body)
	e.mustStatus(resp, 201, out)
	return out["id"].(string)
}

func (e *env) keepAway(pid string, keep bool) map[string]any {
	e.t.Helper()
	resp, out := e.do("PUT", "/api/v1/projects/"+pid+"/agent-access", map[string]any{"kept_away": keep})
	e.mustStatus(resp, 200, out)
	return out
}

func TestAgentExclusionHidesProject(t *testing.T) {
	e, _, secret, c := agentReady(t)
	client := e.newProject(map[string]any{"name": "Client X"})
	invoices := e.newProject(map[string]any{"name": "Invoices", "parent_id": client})
	home := e.newProject(map[string]any{"name": "Home"})
	hidden := e.newTask(map[string]any{"title": "Zanzibar contract", "project_id": client, "due": map[string]any{"date": "2020-01-01"}})
	sub := e.newTask(map[string]any{"title": "Zanzibar invoice", "project_id": invoices})
	shown := e.newTask(map[string]any{"title": "Water plants", "project_id": home, "due": map[string]any{"date": "2020-01-01"}})

	if out := e.keepAway(client, true); out["kept_away"] != true || out["inherited_from"] != nil {
		t.Fatalf("PUT = %v", out)
	}
	resp, out := e.do("GET", "/api/v1/projects/"+invoices+"/agent-access", nil)
	e.mustStatus(resp, 200, out)
	if out["kept_away"] != true || out["inherited_from"] != client {
		t.Fatalf("inherited = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	if l, _ := out["agent_excluded_projects"].([]any); len(l) != 2 {
		t.Fatalf("me = %v", out["agent_excluded_projects"])
	}
	if evs := e.events(audit.ProjectAgentAccessName); len(evs) != 1 || evs[0].Details["to"] != "kept_away" || evs[0].Details["access_project_id"] != client {
		t.Fatalf("audit = %+v", evs)
	}
	// Setting the same value again records nothing.
	e.keepAway(client, true)
	if n := len(e.events(audit.ProjectAgentAccessName)); n != 1 {
		t.Fatalf("audit events = %d", n)
	}

	// Reads leave the project, its sub-project and their tasks out.
	projects := e.mustTool(secret, "list_projects", map[string]any{})["projects"].([]any)
	for _, p := range projects {
		if id := p.(map[string]any)["id"]; id == client || id == invoices {
			t.Fatalf("listed %v", p)
		}
	}
	if got := e.mustTool(secret, "search_tasks", map[string]any{"query": "zanzibar"})["tasks"].([]any); len(got) != 0 {
		t.Fatalf("search = %v", got)
	}
	sum := e.mustTool(secret, "today_summary", map[string]any{"timezone": "UTC"})
	if sum["counts"].(map[string]any)["overdue"].(float64) != 1 {
		t.Fatalf("summary = %v", sum)
	}
	if out := e.rpc(secret, "resources/read", map[string]any{"uri": "opentodo://projects/" + client}); rpcCode(out) != -32002 {
		t.Fatalf("resource = %v", out)
	}
	// Writes naming its tasks fail as not_found and change nothing.
	sc, isErr := e.toolCall(secret, "complete_tasks", map[string]any{"ids": []string{hidden, shown}})
	if !isErr || sc["error"] != "not_found" || !strings.Contains(strings.Join(anyStrings(sc["ids"]), ","), hidden) {
		t.Fatalf("complete = %v", sc)
	}
	if e.task(shown)["completed_at"] != nil {
		t.Fatal("the allowed task was completed")
	}
	sc, isErr = e.toolCall(secret, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "New", "project_id": invoices}}})
	if !isErr || sc["error"] != "not_found" {
		t.Fatalf("create into = %v", sc)
	}
	sc, isErr = e.toolCall(secret, "move_tasks", map[string]any{"ids": []string{shown}, "project_id": client})
	if !isErr || sc["error"] != "not_found" {
		t.Fatalf("move into = %v", sc)
	}
	// The agent REST routes refuse it as 404; ordinary REST is unaffected.
	if resp, out := c.do("PATCH", "/api/v1/tasks/"+sub, map[string]any{"title": "Renamed"}, bearer(secret)...); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("agent REST = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+sub, nil)
	e.mustStatus(resp, 200, out)
	if out["title"] != "Zanzibar invoice" {
		t.Fatalf("agent write went through: %v", out)
	}

	// Switched off again, the next request sees it.
	e.keepAway(client, false)
	if got := e.mustTool(secret, "search_tasks", map[string]any{"query": "zanzibar"})["tasks"].([]any); len(got) != 2 {
		t.Fatalf("search after = %v", got)
	}
}

func anyStrings(v any) []string {
	l, _ := v.([]any)
	out := make([]string, 0, len(l))
	for _, it := range l {
		s, _ := it.(string)
		out = append(out, s)
	}
	return out
}

func TestAgentAccessRoutePolicy(t *testing.T) {
	e, _, secret, c := agentReady(t)
	pid := e.newProject(map[string]any{"name": "Client X"})
	path := "/api/v1/projects/" + pid + "/agent-access"
	if resp, _ := newEnv(t, false).raw("GET", path, nil); resp.StatusCode != 401 {
		t.Fatalf("anonymous = %d", resp.StatusCode)
	}
	resp, out := c.do("PUT", path, map[string]any{"kept_away": false}, bearer(secret)...)
	if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("agent token = %d %v", resp.StatusCode, out)
	}
	for _, body := range []map[string]any{{"kept_away": "yes"}, {}, {"kept_away": true, "x": 1}} {
		resp, out := e.do("PUT", path, body)
		if resp.StatusCode != 400 || !strings.Contains(out["error"].(map[string]any)["message"].(string), "kept_away") {
			t.Fatalf("%v = %d %v", body, resp.StatusCode, out)
		}
	}
	// A member who is not a project member gets 404; an editor gets 403 on PUT.
	m, _ := e.member("member@example.com", "198.51.100.9")
	if resp, out := m.do("GET", path, nil); resp.StatusCode != 404 || errCode(out) != "not_found" {
		t.Fatalf("non-member = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/projects/"+pid+"/members", map[string]any{"email": "member@example.com", "role": "editor"})
	e.mustStatus(resp, 201, out)
	resp, out = m.do("GET", path, nil)
	m.mustStatus(resp, 200, out)
	if resp, out := m.do("PUT", path, map[string]any{"kept_away": true}); resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("editor = %d %v", resp.StatusCode, out)
	}
	if e.keepAway(pid, true)["kept_away"] != true {
		t.Fatal("owner could not set it")
	}
	resp, out = m.do("GET", "/api/v1/me", nil)
	m.mustStatus(resp, 200, out)
	if l, _ := out["agent_excluded_projects"].([]any); len(l) != 1 || l[0] != pid {
		t.Fatalf("member me = %v", out["agent_excluded_projects"])
	}
}
