package mcp

import (
	"strings"
	"testing"
)

// assistant-skills 4.1: the built-in skills as MCP prompts.
func TestPrompts(t *testing.T) {
	f := newFixture(t)
	r := f.call("u1", "prompts/list", nil)
	list := r["result"].(map[string]any)["prompts"].([]any)
	if len(list) != 5 {
		t.Fatalf("prompts = %v", list)
	}
	first := list[0].(map[string]any)
	args := first["arguments"].([]any)
	if first["name"] != "idea-to-project" || first["title"] != "Turn an idea into a project" || len(args) != 1 ||
		args[0].(map[string]any)["name"] != "text" || args[0].(map[string]any)["required"] != false {
		t.Fatalf("first prompt = %v", first)
	}

	text := func(r map[string]any) string {
		t.Helper()
		msgs := r["result"].(map[string]any)["messages"].([]any)
		m := msgs[0].(map[string]any)
		if m["role"] != "user" {
			t.Fatalf("message = %v", m)
		}
		return m["content"].(map[string]any)["text"].(string)
	}
	got := text(f.call("u1", "prompts/get", map[string]any{"name": "weekly-review"}))
	if !strings.Contains(got, "weekly review") || strings.Contains(got, "The user's request") {
		t.Fatalf("weekly-review without text = %q", got)
	}
	got = text(f.call("u1", "prompts/get", map[string]any{"name": "idea-to-project", "arguments": map[string]any{"text": "Garden makeover"}}))
	if !strings.HasSuffix(got, "The user's request:\nGarden makeover") {
		t.Fatalf("with text = %q", got)
	}
	got = text(f.call("u1", "prompts/get", map[string]any{"name": "plan-week", "arguments": map[string]any{"startHour": "9", "endHour": "17", "dayLength": "420"}}))
	if !strings.Contains(got, "from 09:00 to 17:00, at most 420 minutes") {
		t.Fatalf("plan-week workday = %q", got)
	}
	for _, bad := range []map[string]any{{"name": "delete-all"}, {}} {
		if r := f.call("u1", "prompts/get", bad); errCode(r) != CodeInvalidParams {
			t.Fatalf("prompts/get %v: %v", bad, r)
		}
	}
}
