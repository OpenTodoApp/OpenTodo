package mcp

import (
	"encoding/json"
	"strings"
	"testing"
)

// automation-rules mcp-server delta: "Read the rules" (names as untrusted text,
// read-only) and "No write tool for rules".
func TestRulesResource(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "rule", "r1", map[string]any{"name": "Sunday sweep", "enabled": true, "trigger": map[string]any{"kind": "schedule", "at": "18:00", "weekdays": []int{7}},
		"condition": nil, "actions": map[string]any{"due": "tomorrow"}, "position": 1, "created_at": 1})
	r := f.call("u1", "resources/read", map[string]any{"uri": "opentodo://rules"})
	text := r["result"].(map[string]any)["contents"].([]any)[0].(map[string]any)["text"].(string)
	if !strings.Contains(text, `"untrusted_text":{"name":"Sunday sweep"}`) || !strings.Contains(text, `"kind":"schedule"`) {
		t.Fatalf("text = %s", text)
	}
	tools, _ := json.Marshal(f.call("u1", "tools/list", nil))
	if strings.Contains(string(tools), "rule") {
		t.Fatal("a tool mentions rules")
	}
}
