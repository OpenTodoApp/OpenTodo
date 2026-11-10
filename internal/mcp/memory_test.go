package mcp

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
)

// assistant-memory "Memory stays in the app" (Not over MCP): with a memory
// item stored, a read or an agent token lists no tool or resource for it, and
// no tool output or resource names its text.
func TestMemoryNeverOverMCP(t *testing.T) {
	f := newFixture(t)
	const secret = "Prefers xyzzy mornings"
	f.put("u1", "memory", "m1", map[string]any{"text": secret, "position": 1, "created_at": 1})
	f.task("u1", "t1", "Water", map[string]any{"due": map[string]any{"date": "2026-03-10"}})
	f.put("u1", "note", "n1", map[string]any{"title": "Ideas", "created_at": 1})
	for _, scope := range []string{"read", agenttools.ScopeAgent} {
		caller := agenttools.Caller{UserID: "u1", Scope: scope, OwnerAllowsWrites: true, UserAllowsWrites: true}
		send := func(method string, params any) string {
			b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
			out, _ := f.srv.Handle(context.Background(), caller, b)
			if strings.Contains(string(out), "xyzzy") {
				t.Fatalf("%s %s %v returns the memory item: %s", scope, method, params, out)
			}
			return string(out)
		}
		var tools struct {
			Result struct {
				Tools []struct {
					Name        string `json:"name"`
					Annotations struct {
						ReadOnly bool `json:"readOnlyHint"`
					} `json:"annotations"`
				} `json:"tools"`
			} `json:"result"`
		}
		_ = json.Unmarshal([]byte(send("tools/list", nil)), &tools)
		if len(tools.Result.Tools) == 0 {
			t.Fatalf("%s: no tools", scope)
		}
		for _, tool := range tools.Result.Tools {
			if tool.Name == "remember" || strings.Contains(tool.Name, "memor") {
				t.Fatalf("%s lists %s", scope, tool.Name)
			}
			if tool.Annotations.ReadOnly {
				send("tools/call", map[string]any{"name": tool.Name, "arguments": map[string]any{}})
				send("tools/call", map[string]any{"name": tool.Name, "arguments": map[string]any{"timezone": "UTC", "id": "t1", "query": "xyzzy"}})
			}
		}
		var res struct {
			Result struct {
				Resources []struct {
					URI string `json:"uri"`
				} `json:"resources"`
			} `json:"result"`
		}
		_ = json.Unmarshal([]byte(send("resources/list", nil)), &res)
		for _, r := range res.Result.Resources {
			if strings.Contains(r.URI, "memor") {
				t.Fatalf("%s lists resource %s", scope, r.URI)
			}
			send("resources/read", map[string]any{"uri": r.URI})
		}
		for _, uri := range []string{"opentodo://memory", "opentodo://memories", "opentodo://tasks/m1", "opentodo://notes/m1"} {
			send("resources/read", map[string]any{"uri": uri})
		}
	}
}
