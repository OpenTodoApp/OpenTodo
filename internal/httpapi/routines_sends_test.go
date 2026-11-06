package httpapi

import (
	"net/http"
	"strings"
	"testing"
)

// agent-routine-sends: an assistant cannot create, change, turn on or run a
// routine with a step that sends a webhook or an email; it can still read,
// test, turn off and trash one, and the person can do everything in the app.
func TestRoutineSendingStepsRefusedForAgents(t *testing.T) {
	e := rulesEnv(t, nil)
	e.allowWrites(true)
	e.allowMyAssistants(true)
	_, secret := e.namedToken("Desk assistant", "agent")
	c := e.bearerClient()
	refused := func(what string, out map[string]any, isErr bool) {
		t.Helper()
		if !isErr || out["error"] != "forbidden_for_agents" {
			t.Fatalf("%s: %v", what, out)
		}
	}
	rules := func() int {
		var n int
		_ = e.db.QueryRow(`SELECT COUNT(DISTINCT entity_id) FROM ops WHERE entity = 'rule'`).Scan(&n)
		return n
	}

	// Creating: each sending step, nested or not, and the legacy webhook action.
	for name, steps := range map[string]string{
		"webhook":       `[{"id":"a","kind":"webhook","in":{"webhook_id":{"literal":"0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"},"text":{"literal":"x"}}}]`,
		"email_me":      `[{"id":"a","kind":"email_me","in":{"subject":{"literal":"Hi"},"text":{"literal":"Body"}}}]`,
		"email_members": `[{"id":"a","kind":"email_members","in":{"subject":{"literal":"Hi"},"text":{"literal":"Body"}}}]`,
		"nested":        `[{"id":"a","kind":"if","in":{"condition":{"literal":true}},"then":[{"id":"b","kind":"email_me","in":{"subject":{"literal":"Hi"},"text":{"literal":"Body"}}}]}]`,
	} {
		out, isErr := c.toolCall(secret, "create_routine", map[string]any{"name": name, "trigger": `{"kind":"manual"}`, "enabled": false, "steps": steps})
		refused("create_routine "+name, out, isErr)
	}
	out, isErr := c.toolCall(secret, "create_routine", map[string]any{"name": "Legacy", "trigger": `{"kind":"task_created"}`,
		"actions": `{"webhook":{"webhook_id":"0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"}}`})
	refused("create_routine with the webhook action", out, isErr)
	if n := rules(); n != 0 {
		t.Fatalf("%d routines written", n)
	}

	// Changing: adding a sending step to the assistant's own routine.
	plain := `[{"id":"a","kind":"create_tasks","in":{"title":{"literal":"x"}}}]`
	created := c.mustTool(secret, "create_routine", map[string]any{"name": "Plain", "trigger": `{"kind":"manual"}`, "steps": plain})
	own := created["results"].([]any)[0].(map[string]any)["id"].(string)
	out, isErr = c.toolCall(secret, "update_routine", map[string]any{"routine": own,
		"steps": `[{"id":"a","kind":"email_members","in":{"subject":{"literal":"Hi"},"text":{"literal":"Body"}}}]`})
	refused("update_routine adding a step", out, isErr)

	// The person's routine with Email me: read, test, off and trash only.
	id := e.create("/api/v1/rules", map[string]any{"name": "Mail me", "enabled": false, "trigger": map[string]any{"kind": "manual"}, "steps": []any{
		map[string]any{"id": "a", "kind": "email_me", "in": map[string]any{"subject": map[string]any{"literal": "Hi"}, "text": map[string]any{"literal": "Body"}}}}})
	out, isErr = c.toolCall(secret, "set_routine_enabled", map[string]any{"routine": id, "enabled": true})
	refused("set_routine_enabled", out, isErr)
	out, isErr = c.toolCall(secret, "update_routine", map[string]any{"routine": id, "name": "Renamed"})
	refused("update_routine of the person's routine", out, isErr)
	out, isErr = c.toolCall(secret, "run_routine", map[string]any{"routine": id})
	refused("run_routine", out, isErr)
	if msg, _ := out["message"].(string); !strings.Contains(msg, "in the app") {
		t.Fatalf("message %q", msg)
	}
	resp, rule := e.do("GET", "/api/v1/rules/"+id, nil)
	e.mustStatus(resp, 200, rule)
	if rule["enabled"] != false || rule["name"] != "Mail me" {
		t.Fatalf("the person's routine changed: %v", rule)
	}
	var runs int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM rule_runs WHERE rule_id = ?`, id).Scan(&runs); err != nil {
		t.Fatal(err)
	}
	if runs != 0 {
		t.Fatalf("%d runs", runs)
	}
	c.mustTool(secret, "get_routine", map[string]any{"routine": id})
	if test := c.mustTool(secret, "run_routine", map[string]any{"routine": id, "test": true}); test["test"] != true {
		t.Fatalf("test %v", test)
	}

	// The person turns it on in the app; the assistant can turn it off, take
	// the sending step out (what is left sends nothing) and trash it.
	resp, body := e.do("PATCH", "/api/v1/rules/"+id, map[string]any{"enabled": true})
	e.mustStatus(resp, http.StatusOK, body)
	c.mustTool(secret, "set_routine_enabled", map[string]any{"routine": id, "enabled": false})
	c.mustTool(secret, "update_routine", map[string]any{"routine": id, "steps": plain})
	c.mustTool(secret, "trash_routine", map[string]any{"routine": id})
	if resp, _ := e.do("GET", "/api/v1/rules/"+id, nil); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("trashed routine: %d", resp.StatusCode)
	}
}
