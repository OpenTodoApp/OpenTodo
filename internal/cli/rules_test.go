package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// `ot rules` (OpenSpec change automation-rules, task 3.3).

// seedRule creates the rule "Sweep" through the REST API and returns its id.
func (h *harness) seedRule() string {
	h.t.Helper()
	out := h.apiJSON("POST", "/api/v1/rules", map[string]any{"name": "Sweep", "trigger": map[string]any{"kind": "schedule", "at": "18:00", "weekdays": []int{7}},
		"actions": map[string]any{"due": "tomorrow"}})
	id, _ := out["id"].(string)
	if id == "" {
		h.t.Fatalf("seed rule: %v", out)
	}
	return id
}

func TestRulesCommands(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	id := h.seedRule()
	var list []map[string]any
	if err := json.Unmarshal([]byte(h.mustRun("rules", "list", "--json")), &list); err != nil || len(list) != 1 || list[0]["id"] != id {
		t.Fatalf("list %v %v", list, err)
	}
	if table := h.mustRun("rules", "list"); !strings.Contains(table, "Sweep") || !strings.Contains(table, "schedule") {
		t.Fatalf("table %q", table)
	}
	if out := h.mustRun("rules", "disable", id[:6]); !strings.Contains(out, "Sweep: disabled") {
		t.Fatalf("disable %q", out)
	}
	if r := h.apiJSON("GET", "/api/v1/rules/"+id, nil); r["enabled"] != false {
		t.Fatalf("rule %v", r)
	}
	if out := h.mustRun("rules", "runs", "Sweep"); !strings.Contains(out, "No runs.") {
		t.Fatalf("runs %q", out)
	}
	// A read token reads but may not switch a rule.
	h.setToken(strings.TrimSpace(h.mustRun("token", "create", "reader", "--scope", "read")))
	h.mustRun("rules", "list")
	if code, _, _ := h.run("rules", "enable", "Sweep"); code != ExitNotPermitted {
		t.Fatalf("read token enable: exit %d", code)
	}
}
