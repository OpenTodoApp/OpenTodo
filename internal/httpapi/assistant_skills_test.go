package httpapi

import (
	"slices"
	"strings"
	"testing"
)

// assistant-skills 1.2: the skill list follows the assistant's availability.
func TestAssistantSkillsRoute(t *testing.T) {
	e, _, _ := assistantEnv(t)
	list := func(c *env) []any {
		t.Helper()
		resp, out := c.do("GET", "/api/v1/assistant/skills", nil)
		c.mustStatus(resp, 200, out)
		return out["skills"].([]any)
	}
	if n := len(list(e)); n != 0 {
		t.Fatalf("disabled server lists %d skills", n)
	}
	e.enableAssistant(nil)
	skills := list(e)
	if len(skills) != 5 {
		t.Fatalf("skills = %v", skills)
	}
	first := skills[0].(map[string]any)
	if first["id"] != "idea-to-project" || first["name"] == "" || first["description"] == "" || first["example"] == "" {
		t.Fatalf("first skill = %v", first)
	}
	if _, leaked := first["instructions"]; leaked {
		t.Fatal("instructions are sent to the client")
	}
	resp, out := newClientFor(e).do("GET", "/api/v1/assistant/skills", nil)
	newClientFor(e).mustStatus(resp, 401, out)
	// An encrypted account gets none.
	m := newClientAt(e, "10.0.0.9")
	resp, out = m.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "name": "M", "password": "correct horse battery"})
	m.mustStatus(resp, 201, out)
	if n := len(list(m)); n != 5 {
		t.Fatalf("member lists %d skills", n)
	}
	resp, out = m.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	m.mustStatus(resp, 201, out)
	if n := len(list(m)); n != 0 {
		t.Fatalf("encrypted account lists %d skills", n)
	}
}

// assistant-skills 2.1: an unknown skill or a bad workday is refused before
// any provider request; a bearer token is refused as for any turn.
func TestTurnSkillValidation(t *testing.T) {
	e, llm, _ := assistantEnv(t)
	e.enableAssistant(nil)
	e.consentAssistant("anthropic")
	base := llm.hits.Load()
	withSkill := func(id string, extra map[string]any) map[string]any {
		b := ask("go")
		b["skill"] = id
		for k, v := range extra {
			b[k] = v
		}
		return b
	}
	if code, out, _ := e.turn(withSkill("export-everything", nil)); code != 400 || errCode(out) != "unknown_skill" {
		t.Fatalf("unknown skill: %d %v", code, out)
	}
	if code, out, _ := e.turn(withSkill("plan-week", map[string]any{"workday": map[string]any{"startHour": 20, "endHour": 8, "dayLength": 480}})); code != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("bad workday: %d %v", code, out)
	}
	pastedLast := map[string]any{"timezone": "UTC", "messages": []any{map[string]any{"role": "user", "text": "notes", "untrusted": true}}}
	if code, out, _ := e.turn(pastedLast); code != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("pasted text as the question: %d %v", code, out)
	}
	full := e.token("full")
	if code, out, _ := e.bearerClient().turn(withSkill("plan-week", nil), "Authorization", "Bearer "+full); code != 403 || errCode(out) != "session_required" {
		t.Fatalf("bearer with skill: %d %v", code, out)
	}
	if llm.hits.Load() != base {
		t.Fatal("a refused skill turn reached the provider")
	}
}

// assistant-skills 2.2: the skill runs, its id is counted for the month, and
// the provider saw the skill section and only the skill's tools.
func TestTurnRunsSkill(t *testing.T) {
	e, llm, svc := assistantEnv(t)
	e.enableAssistant(nil)
	e.consentAssistant("anthropic")
	llm.set(reply([]fakeBlock{{text: "Here is your week."}}, "end_turn"))
	body := ask("plan it")
	body["skill"] = "plan-week"
	body["workday"] = map[string]any{"startHour": 9, "endHour": 17, "dayLength": 420}
	code, out, events := e.turn(body)
	if code != 200 || len(named(events, "done")) != 1 {
		t.Fatalf("turn: %d %v %v", code, out, events)
	}
	llm.mu.Lock()
	req := llm.bodies[len(llm.bodies)-1]
	llm.mu.Unlock()
	sys, _ := req["system"].(string)
	if sys == "" {
		if parts, ok := req["system"].([]any); ok && len(parts) > 0 {
			sys, _ = parts[0].(map[string]any)["text"].(string)
		}
	}
	if !strings.Contains(sys, "Skill: Plan my week") || !strings.Contains(sys, "from 09:00 to 17:00") {
		t.Fatalf("system prompt = %q", sys)
	}
	var tools []string
	for _, tl := range req["tools"].([]any) {
		tools = append(tools, tl.(map[string]any)["name"].(string))
	}
	slices.Sort(tools)
	if strings.Join(tools, ",") != "get_task,list_tasks,schedule_tasks,search_tasks,update_tasks" {
		t.Fatalf("tools offered = %v", tools)
	}
	uses, err := (*svc).Store.SkillUses(t.Context(), userIDOf(t, e))
	if err != nil || uses["plan-week"] != 1 {
		t.Fatalf("skill uses = %v %v", uses, err)
	}
}
