package mcp

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/assistant"
)

// The in-app assistant's display tools (OpenSpec change assistant-generative-ui,
// design D1) render nothing for an MCP client: no caller ever lists or calls them.
func TestDisplayToolsNotInMCP(t *testing.T) {
	f := newFixture(t)
	display := map[string]bool{}
	for _, d := range assistant.DisplayTools {
		display[d.Name] = true
	}
	if len(display) != 16 {
		t.Fatalf("display tools = %v", display)
	}
	for _, c := range []agenttools.Caller{
		{UserID: "u1", TokenID: "tk", TokenName: "Desk", Scope: "agent", OwnerAllowsWrites: true, UserAllowsWrites: true},
		{UserID: "u1", TokenID: "tk2", TokenName: "Read", Scope: "read"},
	} {
		out, _ := f.srv.Handle(context.Background(), c, []byte(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
		var r map[string]any
		if err := json.Unmarshal(out, &r); err != nil {
			t.Fatal(err)
		}
		for _, tl := range r["result"].(map[string]any)["tools"].([]any) {
			if name := tl.(map[string]any)["name"].(string); display[name] {
				t.Fatalf("%s token lists %s", c.Scope, name)
			}
		}
		out, _ = f.srv.Handle(context.Background(), c, []byte(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"show_tasks","arguments":{"ids":["t1"]}}}`))
		if err := json.Unmarshal(out, &r); err != nil {
			t.Fatal(err)
		}
		if r["error"] == nil && r["result"].(map[string]any)["isError"] != true {
			t.Fatalf("%s token called show_tasks: %s", c.Scope, out)
		}
	}
}
