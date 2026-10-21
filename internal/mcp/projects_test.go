package mcp

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/agenttools"
)

// Project and section tools on MCP (OpenSpec change mcp-projects).

func TestListIconsTool(t *testing.T) {
	f := newFixture(t)
	res := f.tool("u1", "list_icons", map[string]any{"query": "plant"})
	icons := res["icons"].([]any)
	if len(icons) == 0 {
		t.Fatal("no icons for plant")
	}
	first := icons[0].(map[string]any)
	if first["name"] == "" || first["category"] == nil || first["keywords"] == nil {
		t.Fatalf("icon entry = %v", first)
	}
	r := f.call("u1", "tools/call", map[string]any{"name": "list_icons", "arguments": map[string]any{"limit": 1000}})
	if errCode(r) != CodeInvalidParams || !strings.Contains(r["error"].(map[string]any)["message"].(string), "limit") {
		t.Fatalf("bad limit = %v", r)
	}
}

func TestStructureToolsThroughHandle(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "garden", map[string]any{"name": "Garden", "color": "#64748b", "archived": false})
	agent := agenttools.Caller{UserID: "u1", TokenID: "tk", TokenName: "Desk", Scope: "agent", OwnerAllowsWrites: true, UserAllowsWrites: true}
	send := func(c agenttools.Caller, name string, a map[string]any) map[string]any {
		b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": map[string]any{"name": name, "arguments": a}})
		out, _ := f.srv.Handle(context.Background(), c, b)
		var r map[string]any
		_ = json.Unmarshal(out, &r)
		return r
	}
	r := send(agent, "update_project", map[string]any{"id": "garden", "color": "#16A34A", "icon": "sprout"})
	if res, _ := r["result"].(map[string]any); res == nil || res["isError"] == true {
		t.Fatalf("update_project = %v", r)
	}
	if r := send(agent, "update_project", map[string]any{"id": "garden", "icon": "unicorn-rainbow"}); errCode(r) != CodeInvalidParams {
		t.Fatalf("unknown icon = %v", r)
	}
	if r := send(agent, "update_project", map[string]any{"id": "garden", "archived": true}); errCode(r) != CodeInvalidParams {
		t.Fatalf("archived = %v", r)
	}
	// Writes off: refused through the gate, nothing written.
	off := agent
	off.OwnerAllowsWrites = false
	if r := send(off, "create_sections", map[string]any{"project_id": "garden", "items": []any{map[string]any{"name": "x"}}}); r["error"] == nil && r["result"].(map[string]any)["isError"] != true {
		t.Fatalf("writes off = %v", r)
	}
	p, _ := f.sync.Get(context.Background(), "u1", "project", "garden")
	var icon string
	_ = json.Unmarshal(p["icon"], &icon)
	if icon != "sprout" {
		t.Fatalf("garden = %v", p)
	}
}
