package httpapi

import (
	"encoding/json"
	"strings"
	"testing"
)

// routines-engine 3.4 and 3.5: the routine read and write tools over MCP.
func TestRoutineMCPTools(t *testing.T) {
	e := rulesEnv(t, nil)
	e.allowWrites(true)
	e.allowMyAssistants(true)
	_, secret := e.namedToken("Desk assistant", "agent")
	_, reader := e.namedToken("Reader", "read")
	c := e.bearerClient()
	steps := `[{"id":"a","kind":"split_lines","in":{"text":{"literal":"one\ntwo\nthree"}}},{"id":"b","kind":"create_tasks","in":{"text":{"ref":"a"}}},{"id":"c","kind":"count","in":{"list":{"ref":"b"}}}]`
	// "Create and test": created off, then a test plans and writes nothing.
	created := c.mustTool(secret, "create_routine", map[string]any{"name": "Three", "trigger": `{"kind":"manual"}`, "steps": steps})
	id := created["results"].([]any)[0].(map[string]any)["id"].(string)
	resp, rule := e.do("GET", "/api/v1/rules/"+id, nil)
	e.mustStatus(resp, 200, rule)
	if rule["enabled"] != false || len(rule["steps"].([]any)) != 3 {
		t.Fatalf("created %v", rule)
	}
	test := c.mustTool(secret, "run_routine", map[string]any{"routine": "Three", "test": true})
	if test["writes"] != float64(3) || test["test"] != true || len(test["steps"].([]any)) != 3 {
		t.Fatalf("test %v", test)
	}
	resp, out := e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["tasks"].([]any)); n != 0 {
		t.Fatalf("a test wrote %d tasks", n)
	}
	run := c.mustTool(secret, "run_routine", map[string]any{"routine": id})
	if run["run"].(map[string]any)["source"] != "mcp" || run["run"].(map[string]any)["outcome"] != "applied" {
		t.Fatalf("run %v", run)
	}
	// History names the assistant for the definition.
	var device string
	if err := e.db.QueryRow(`SELECT device FROM ops WHERE entity = 'rule' AND entity_id = ? AND field = 'steps'`, id).Scan(&device); err != nil || !strings.HasPrefix(device, "agent:") {
		t.Fatalf("device %q %v", device, err)
	}
	// "Invalid steps": invalid_argument naming the step and input; unchanged.
	bad, isErr := c.toolCall(secret, "update_routine", map[string]any{"routine": id,
		"steps": `[{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"due":"today"}}}},{"id":"b","kind":"notify","in":{"text":{"ref":"a"}}}]`})
	if !isErr || bad["error"] != "invalid_argument" || !strings.Contains(bad["message"].(string), "notify: text expects Text, got Tasks") {
		t.Fatalf("invalid steps %v", bad)
	}
	// "Unavailable step": created, with the reason.
	mail := c.mustTool(secret, "create_routine", map[string]any{"name": "Mail", "trigger": `{"kind":"manual"}`,
		"steps": `[{"id":"a","kind":"email_me","in":{"subject":{"literal":"Hi"},"text":{"literal":"Body"}}}]`})
	if u := mail["unavailable"].([]any); len(u) != 1 || u[0].(map[string]any)["reason"] != "email_not_configured" {
		t.Fatalf("unavailable %v", mail)
	}
	// Read tools, with a read token.
	list := c.mustTool(reader, "list_routines", nil)
	if n := len(list["routines"].([]any)); n != 2 {
		t.Fatalf("list %v", list)
	}
	got := c.mustTool(reader, "get_routine", map[string]any{"routine": "Three"})
	raw, _ := json.Marshal(got)
	if !strings.Contains(string(raw), `"untrusted_text":{"name":"Three"`) {
		t.Fatalf("get %s", raw)
	}
	runs := c.mustTool(reader, "list_routine_runs", map[string]any{"routine": "Three"})
	list2 := runs["runs"].([]any)
	if len(list2) != 2 {
		t.Fatalf("runs %v", runs)
	}
	runID := list2[0].(map[string]any)["run_id"].(string)
	one := c.mustTool(reader, "get_routine_run", map[string]any{"routine": "Three", "run_id": runID})
	if len(one["run"].(map[string]any)["steps"].([]any)) != 3 {
		t.Fatalf("one run %v", one)
	}
	// Resources; another account's routine is not found.
	res := c.rpc(reader, "resources/read", map[string]any{"uri": "opentodo://routines/" + id})
	if _, ok := res["result"]; !ok {
		t.Fatalf("resource %v", res)
	}
	m, _ := e.member("member@example.com", "203.0.113.9")
	_, mine := m.namedToken("Mine", "read")
	res = m.bearerClient().rpc(mine, "resources/read", map[string]any{"uri": "opentodo://routines/" + id})
	if errObj, ok := res["error"].(map[string]any); !ok || errObj["code"] != float64(-32002) {
		t.Fatalf("another account's routine %v", res)
	}
	// "Gate closed": the user's switch off hides the write tools.
	e.allowMyAssistants(false)
	_, isErr = c.toolCall(secret, "set_routine_enabled", map[string]any{"routine": id, "enabled": true})
	if !isErr {
		t.Fatal("set_routine_enabled through a closed gate")
	}
	resp, rule = e.do("GET", "/api/v1/rules/"+id, nil)
	e.mustStatus(resp, 200, rule)
	if rule["enabled"] != false {
		t.Fatal("the gate let a write through")
	}
	e.allowMyAssistants(true)
	c.mustTool(secret, "set_routine_enabled", map[string]any{"routine": id, "enabled": true})
	c.mustTool(secret, "trash_routine", map[string]any{"routine": id})
	resp, _ = e.do("GET", "/api/v1/rules/"+id, nil)
	if resp.StatusCode != 404 {
		t.Fatalf("trashed routine: %d", resp.StatusCode)
	}
}

// routines-shared 3.2: create_routine takes a project; list and get name the
// project and the run-as person; a viewer's agent cannot turn it on.
func TestSharedRoutineMCPTools(t *testing.T) {
	e := rulesEnv(t, nil)
	e.allowWrites(true)
	e.allowMyAssistants(true)
	_, secret := e.namedToken("Desk assistant", "agent")
	c := e.bearerClient()
	viewer, _ := e.member("viewer@example.com", "10.0.0.5")
	home := e.create("/api/v1/projects", map[string]any{"name": "Household"})
	addByEmail(e, viewer, "/api/v1/projects/"+home+"/members", "viewer@example.com", "viewer")
	created := c.mustTool(secret, "create_routine", map[string]any{"name": "Chores", "trigger": `{"kind":"manual"}`, "project": "Household", "enabled": true,
		"steps": `[{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{}}}}]`})
	id := created["results"].([]any)[0].(map[string]any)["id"].(string)
	list := c.mustTool(secret, "list_routines", nil)
	item := list["routines"].([]any)[0].(map[string]any)
	if item["project_id"] != home || item["run_as"].(map[string]any)["id"] != e.userID() {
		t.Fatalf("list %v", item)
	}
	got := c.mustTool(secret, "get_routine", map[string]any{"routine": id})
	if got["routine"].(map[string]any)["project_id"] != home {
		t.Fatalf("get %v", got)
	}
	viewer.allowMyAssistants(true)
	_, vsecret := viewer.namedToken("Viewer assistant", "agent")
	if _, isErr := viewer.bearerClient().toolCall(vsecret, "set_routine_enabled", map[string]any{"routine": id, "enabled": false}); !isErr {
		t.Fatal("a viewer's agent turned a shared routine off")
	}
}
