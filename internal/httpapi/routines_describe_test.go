package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// routines-describe-it: Describe it's route through the real HTTP stack
// against the fake Messages API.

// draftReply answers with one draft_routine call.
func draftReply(name, trigger, condition, steps, note string) func(w http.ResponseWriter, _ map[string]any) {
	in, _ := json.Marshal(map[string]any{"name": name, "trigger": trigger, "condition": condition, "steps": steps, "note": note})
	return reply([]fakeBlock{{tool: "draft_routine", input: string(in)}}, "tool_use")
}

func (e *env) draft(text string, headers ...string) (int, map[string]any) {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/assistant/routine-draft", map[string]any{"text": text}, headers...)
	return resp.StatusCode, out
}

// TestRoutineDraftRoute: "A sentence becomes a draft" (the trigger, the steps
// with the user's projects, unsaved), what the model is sent, the retry with
// the errors, "Nothing is saved", and the usage tagged routine_draft.
func TestRoutineDraftRoute(t *testing.T) {
	e, llm := aiRoutinesEnv(t)
	e.enableAssistant(nil)
	e.consentAssistant("anthropic")
	groceries := e.create("/api/v1/projects", map[string]any{"name": "Groceries"})
	errands := e.create("/api/v1/projects", map[string]any{"name": "Errands"})
	trigger := `{"kind":"schedule","at":"17:00","weekdays":[5]}`
	good := `[{"id":"a","kind":"note_text","in":{"of":{"literal":{"project":"` + groceries + `"}}}},{"id":"b","kind":"split_lines","in":{"text":{"ref":"a"}}},{"id":"c","kind":"create_tasks","in":{"text":{"ref":"b"},"project":{"literal":{"project":"` + errands + `"}}}}]`
	// The first draft names a project that does not exist and a task chosen by hand.
	bad := `[{"id":"a","kind":"note_text","in":{"of":{"literal":{"project":"nope"}}}},{"id":"b","kind":"add_comment","in":{"task":{"literal":{"task":"t1"}},"text":{"ref":"a"}}}]`
	llm.set(draftReply("Groceries", trigger, "null", bad, ""), draftReply("Groceries", trigger, "null", good, ""))
	code, out := e.draft("every Friday at five, make tasks in Errands from my Groceries note")
	if code != 200 {
		t.Fatalf("%d %v", code, out)
	}
	d, _ := out["draft"].(map[string]any)
	if d == nil || d["name"] != "Groceries" || d["trigger"].(map[string]any)["at"] != "17:00" || d["condition"] != nil || len(d["steps"].([]any)) != 3 || len(out["errors"].([]any)) != 0 {
		t.Fatalf("answer %v", out)
	}
	if llm.hits.Load() != 2 {
		t.Fatalf("%d provider calls", llm.hits.Load())
	}
	first, second := llm.bodies[0], llm.bodies[1]
	tools := first["tools"].([]any)
	sys, _ := json.Marshal(first["system"])
	if len(tools) != 1 || tools[0].(map[string]any)["name"] != "draft_routine" || !strings.Contains(string(sys), "- note_text:") || strings.Contains(string(sys), "- get_task:") || strings.Contains(string(sys), "- email_me:") {
		t.Fatalf("first request: tools %v system %s", tools, sys)
	}
	msgs, _ := json.Marshal(first["messages"])
	if !strings.Contains(string(msgs), `untrusted_text`) || !strings.Contains(string(msgs), groceries) {
		t.Fatalf("context not sent: %s", msgs)
	}
	retry, _ := json.Marshal(second["messages"])
	if !strings.Contains(string(retry), "tool_result") || !strings.Contains(string(retry), "chosen by hand") || !strings.Contains(string(retry), "does not check") {
		t.Fatalf("retry: %s", retry)
	}
	// Nothing is saved.
	resp, rules := e.do("GET", "/api/v1/rules", nil)
	e.mustStatus(resp, 200, rules)
	if n := len(rules["rules"].([]any)); n != 0 {
		t.Fatalf("%d rules after a draft", n)
	}
	usage := out["usage"].(map[string]any)
	if usage["input"].(float64) != 240 || usage["output"].(float64) != 60 {
		t.Fatalf("usage %v", usage)
	}
	resp, u := e.do("GET", "/api/v1/me/assistant/usage", nil)
	e.mustStatus(resp, 200, u)
	if dr := u["drafts"].(map[string]any); dr["calls"].(float64) != 1 || dr["total_tokens"].(float64) != 300 || u["total_tokens"].(float64) != 300 {
		t.Fatalf("usage %v", u)
	}

	// "Only available steps": outgoing email is not set up, so an Email me
	// step is an error twice and comes back with its errors.
	email := `[{"id":"a","kind":"email_me","in":{"subject":{"literal":"Week"},"text":{"literal":"x"}}}]`
	llm.set(draftReply("Week", trigger, "null", email, ""))
	code, out = e.draft("email me my week every Friday")
	errs, _ := out["errors"].([]any)
	if code != 200 || len(errs) == 0 || errs[0].(map[string]any)["code"] != "unavailable" || errs[0].(map[string]any)["step"] != "a" {
		t.Fatalf("email: %d %v", code, out)
	}
	// A model that answers in words: no draft, its words as the note.
	llm.set(reply([]fakeBlock{{text: "Email is not available here."}}, "end_turn"))
	code, out = e.draft("email me my week every Friday")
	if code != 200 || out["draft"] != nil || out["note"] != "Email is not available here." {
		t.Fatalf("words: %d %v", code, out)
	}
}

// TestRoutineDraftGuards: the route's refusals, none of which reaches the provider.
func TestRoutineDraftGuards(t *testing.T) {
	e, llm := aiRoutinesEnv(t)
	if code, out := e.draft("hi"); code != 404 || errCode(out) != "not_found" {
		t.Fatalf("disabled: %d %v", code, out)
	}
	e.enableAssistant(map[string]any{"monthly_token_cap_per_user": 1000})
	if code, out := e.draft("hi"); code != 403 || errCode(out) != "consent_required" {
		t.Fatalf("no consent: %d %v", code, out)
	}
	e.consentAssistant("anthropic")
	refused := func(name string, want int, wantCode string, c *env, text string, headers ...string) {
		t.Helper()
		base := llm.hits.Load()
		code, out := c.draft(text, headers...)
		if code != want || errCode(out) != wantCode {
			t.Fatalf("%s: %d %v (want %d %s)", name, code, out, want, wantCode)
		}
		if llm.hits.Load() != base {
			t.Fatalf("%s reached the provider", name)
		}
	}
	refused("anonymous", 401, "unauthorized", newClientFor(e), "hi")
	full := e.token("full")
	refused("full token", 403, "session_required", e.bearerClient(), "hi", "Authorization", "Bearer "+full)
	refused("over 500 characters", 413, "too_large", e, strings.Repeat("x", 501))
	refused("empty", 400, "invalid_input", e, "  ")
	// At the cap: 429 naming the reset date.
	if _, err := e.db.Exec(`INSERT INTO assistant_usage(user_id, month, input_tokens, output_tokens, turns) VALUES(?, strftime('%Y-%m', 'now'), 900, 100, 1)`, userIDOf(t, e)); err != nil {
		t.Fatal(err)
	}
	refused("cap", 429, "assistant_quota", e, "hi")
	if _, err := e.db.Exec(`DELETE FROM assistant_usage`); err != nil {
		t.Fatal(err)
	}
	// One turn per user: a held chat turn refuses a draft.
	llm.mu.Lock()
	llm.block = make(chan struct{})
	llm.mu.Unlock()
	done := make(chan int)
	base := llm.hits.Load()
	go func() { c, _, _ := e.turn(ask("slow")); done <- c }()
	waitFor(t, func() bool { return llm.hits.Load() > base })
	refused("turn running", 409, "turn_in_progress", e, "hi")
	llm.mu.Lock()
	close(llm.block)
	llm.block = nil
	llm.mu.Unlock()
	<-done
	// 10 drafts an hour, then 429 rate_limited.
	llm.set(reply([]fakeBlock{{text: "No."}}, "end_turn"))
	for i := 0; i < 10; i++ {
		if _, err := e.db.Exec(`DELETE FROM assistant_usage`); err != nil {
			t.Fatal(err)
		}
		if code, out := e.draft("hi"); code != 200 {
			t.Fatalf("draft %d: %d %v", i, code, out)
		}
	}
	refused("11th draft", 429, "rate_limited", e, "hi")
	// Encrypted account: drafts run on the device, never here.
	m := newClientAt(e, "10.0.0.9")
	resp, o := m.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "name": "M", "password": "correct horse battery"})
	m.mustStatus(resp, 201, o)
	m.consentAssistant("anthropic")
	resp, o = m.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	m.mustStatus(resp, 201, o)
	refused("encrypted", 409, "encryption_enabled", m, "hi")
}
