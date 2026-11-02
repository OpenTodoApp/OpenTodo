package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/assistant"
	"github.com/OpenTodoApp/opentodo/internal/rules"
)

// aiRoutinesEnv is an owner with routines on and the server's Anthropic host
// the fake LLM.
func aiRoutinesEnv(t *testing.T) (*env, *fakeLLM) {
	t.Helper()
	llm := newFakeLLM(t)
	e := newEnvWith(t, true, WithAssistantSetup(func(s *assistant.Service) {
		s.AnthropicBaseURL = llm.srv.URL
		s.Fixed = llm.srv.Client()
	}), func(s *Server) {
		s.rules = rules.New(s.sync.DB(), s.sync, slog.New(slog.NewTextHandler(io.Discard, nil)))
		s.ruleSwitch = rules.NewSwitch(s.sync.DB(), nil)
	})
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e, llm
}

func stepEntry(e *env, kind string) map[string]any {
	e.t.Helper()
	resp, out := e.do("GET", "/api/v1/me/rules/catalogue", nil)
	e.mustStatus(resp, 200, out)
	for _, s := range out["steps"].([]any) {
		if k := s.(map[string]any); k["kind"] == kind {
			return k
		}
	}
	e.t.Fatalf("no %s in the catalogue", kind)
	return nil
}

// routines-ai-step: availability and consent, a run that ends in a proposal,
// the proposal routes and who may call them, and the AI fields of a rule.
func TestRoutineAIProposalRoutes(t *testing.T) {
	e, llm := aiRoutinesEnv(t)
	// "No provider": unavailable with ai_not_configured.
	if k := stepEntry(e, "ask_ai"); k["available"] != false || k["reason"] != "ai_not_configured" {
		t.Fatalf("no provider %v", k)
	}
	e.enableAssistant(nil)
	// "Existing consent": chats work, AI steps need the routines consent.
	e.consentAssistant("anthropic")
	if k := stepEntry(e, "ask_ai"); k["reason"] != "ai_no_consent" || k["setting"] != "integrations.assistant" {
		t.Fatalf("chat consent only %v", k)
	}
	resp, out := e.do("PUT", "/api/v1/me/assistant", map[string]any{"consent": true, "provider": "anthropic", "routines": true})
	e.mustStatus(resp, 200, out)
	if out["routines_consented"] != true || out["consented"] != true {
		t.Fatalf("accepting %v", out)
	}
	if k := stepEntry(e, "summarise"); k["available"] != true {
		t.Fatalf("after consent %v", k)
	}
	anon := newClientAt(e, "203.0.113.10")
	resp, out = anon.do("PUT", "/api/v1/me/assistant", map[string]any{"consent": true, "provider": "anthropic", "routines": true})
	anon.mustStatus(resp, 401, out)

	// The AI fields of a rule.
	steps := []any{
		map[string]any{"id": "a", "kind": "ask_ai", "in": map[string]any{"instruction": map[string]any{"literal": "two errands, one per line"}, "answer": map[string]any{"literal": "lines"}}},
		map[string]any{"id": "b", "kind": "create_tasks", "in": map[string]any{"text": map[string]any{"ref": "a"}}},
	}
	resp, out = e.do("POST", "/api/v1/rules", map[string]any{"name": "Errands", "trigger": map[string]any{"kind": "manual"}, "steps": steps, "ai_apply": "maybe"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("POST", "/api/v1/rules", map[string]any{"name": "Errands", "trigger": map[string]any{"kind": "manual"}, "steps": steps, "ai_budget": 500})
	e.mustStatus(resp, 400, out)
	id := e.create("/api/v1/rules", map[string]any{"name": "Errands", "trigger": map[string]any{"kind": "manual"}, "steps": steps, "ai_budget": 30000})
	resp, rule := e.do("GET", "/api/v1/rules/"+id, nil)
	e.mustStatus(resp, 200, rule)
	if mode, _ := rule["ai_mode"].(map[string]any); mode == nil || mode["auto"] != false || mode["asked"] != false {
		t.Fatalf("ai_mode %v", rule["ai_mode"])
	}

	// A run is a proposal: the provider got no tools, nothing was written.
	llm.set(reply([]fakeBlock{{text: "Buy milk\nPost the letter"}}, "end_turn"))
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "run-1"})
	e.mustStatus(resp, 200, out)
	run := out["run"].(map[string]any)
	if run["outcome"] != "proposal" || run["writes"] != float64(0) || run["tokens"].(float64) <= 0 {
		t.Fatalf("run %v", run)
	}
	if tools, _ := llm.bodies[0]["tools"].([]any); len(tools) > 0 {
		t.Fatalf("the provider was offered tools: %v", llm.bodies[0]["tools"])
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["tasks"].([]any)); n != 0 {
		t.Fatalf("a proposal wrote %d tasks", n)
	}
	resp, out = e.do("GET", "/api/v1/me/rules/proposals", nil)
	e.mustStatus(resp, 200, out)
	list := out["proposals"].([]any)
	if len(list) != 1 {
		t.Fatalf("proposals %v", out)
	}
	pid := list[0].(map[string]any)["id"].(string)
	resp, p := e.do("GET", "/api/v1/me/rules/proposals/"+pid, nil)
	e.mustStatus(resp, 200, p)
	items := p["list"].([]any)
	if len(items) != 2 || items[0].(map[string]any)["ai"] != true {
		t.Fatalf("items %v", items)
	}

	// Who may call the routes.
	resp, out = anon.do("GET", "/api/v1/me/rules/proposals", nil)
	anon.mustStatus(resp, 401, out)
	c := e.bearerClient()
	for _, scope := range []string{"agent", "read"} {
		secret := e.token(scope)
		for _, rt := range [][2]string{{"POST", "/api/v1/me/rules/proposals/" + pid + "/apply"}, {"GET", "/api/v1/me/rules/proposals/" + pid}, {"DELETE", "/api/v1/me/rules/proposals/" + pid}} {
			resp, out := c.do(rt[0], rt[1], map[string]any{}, bearer(secret)...)
			if resp.StatusCode != http.StatusForbidden || errCode(out) != "insufficient_scope" {
				t.Fatalf("%s token %s %s: %d %v", scope, rt[0], rt[1], resp.StatusCode, out)
			}
		}
	}

	// "Apply some": one of the two items.
	key := items[1].(map[string]any)["key"].(string)
	resp, out = e.do("POST", "/api/v1/me/rules/proposals/"+pid+"/apply", map[string]any{"items": []string{key}})
	e.mustStatus(resp, 200, out)
	if out["state"] != "partly_applied" || out["applied"] != float64(1) {
		t.Fatalf("apply %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	if ts := out["tasks"].([]any); len(ts) != 1 || ts[0].(map[string]any)["title"] != "Post the letter" {
		t.Fatalf("tasks %v", ts)
	}
	// "Already handled".
	resp, out = e.do("POST", "/api/v1/me/rules/proposals/"+pid+"/apply", map[string]any{})
	if resp.StatusCode != http.StatusConflict || errCode(out) != "proposal_closed" {
		t.Fatalf("again %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("DELETE", "/api/v1/me/rules/proposals/"+pid, nil)
	if resp.StatusCode != http.StatusConflict || errCode(out) != "proposal_closed" {
		t.Fatalf("dismiss closed %d %v", resp.StatusCode, out)
	}
	// The run's Undo takes the applied item back.
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/runs/"+run["run_id"].(string)+"/undo", map[string]any{})
	e.mustStatus(resp, 200, out)
	if out["restored"] != float64(1) {
		t.Fatalf("undo %v", out)
	}

	// The routine's AI usage, and the assistant's usage under routines.
	resp, out = e.do("GET", "/api/v1/rules/"+id+"/ai-usage", nil)
	e.mustStatus(resp, 200, out)
	if out["budget"] != float64(30000) || len(out["days"].([]any)) != 1 || out["mode"] == nil {
		t.Fatalf("ai usage %v", out)
	}
	resp, out = e.do("GET", "/api/v1/me/assistant/usage", nil)
	e.mustStatus(resp, 200, out)
	if r := out["routines"].(map[string]any); r["calls"] != float64(1) || r["total_tokens"].(float64) <= 0 {
		t.Fatalf("usage %v", out)
	}
}

// Agents cannot apply AI results without asking (routines-ai-step D6): the
// MCP routine tools refuse ai_apply with forbidden_for_agents and the rule
// is unchanged; the REST rules routes refuse agent tokens.
func TestRoutineAIApplyRefusedForAgents(t *testing.T) {
	e := rulesEnv(t, nil)
	e.allowWrites(true)
	e.allowMyAssistants(true)
	_, secret := e.namedToken("Desk assistant", "agent")
	c := e.bearerClient()
	id := e.create("/api/v1/rules", map[string]any{"name": "Notes", "trigger": map[string]any{"kind": "manual"}, "steps": []any{
		map[string]any{"id": "a", "kind": "create_tasks", "in": map[string]any{"title": map[string]any{"literal": "x"}}}}})
	out, isErr := c.toolCall(secret, "update_routine", map[string]any{"routine": id, "ai_apply": "auto"})
	if !isErr || out["error"] != "forbidden_for_agents" {
		t.Fatalf("update_routine %v", out)
	}
	out, isErr = c.toolCall(secret, "create_routine", map[string]any{"name": "Sneaky", "trigger": `{"kind":"manual"}`, "ai_apply": "auto",
		"steps": `[{"id":"a","kind":"create_tasks","in":{"title":{"literal":"x"}}}]`})
	if !isErr || out["error"] != "forbidden_for_agents" {
		t.Fatalf("create_routine %v", out)
	}
	var n int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM ops WHERE entity = 'rule' AND field = 'ai_apply'`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d ai_apply ops", n)
	}
	resp, body := c.do("PATCH", "/api/v1/rules/"+id, map[string]any{"ai_apply": "auto"}, bearer(secret)...)
	if resp.StatusCode != http.StatusForbidden || errCode(body) != "insufficient_scope" {
		t.Fatalf("REST with an agent token %d %v", resp.StatusCode, body)
	}
	resp, body = c.do("POST", "/api/v1/sync", map[string]any{"device": "d", "cursor": 0, "ops": []any{}}, bearer(secret)...)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("sync with an agent token %d %v", resp.StatusCode, body)
	}
	// The person can.
	resp, body = e.do("PATCH", "/api/v1/rules/"+id, map[string]any{"ai_apply": "auto"})
	e.mustStatus(resp, 200, body)
}
