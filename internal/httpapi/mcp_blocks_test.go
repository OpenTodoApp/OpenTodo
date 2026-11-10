package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/mcp"
)

// The MCP Apps transport (OpenSpec change mcp-blocks, design D4, D6): an
// initialize announcing the extension gets an Apps session id, requests that
// carry it are offered the display tools, and an encrypted account only
// through the decrypting bridge.
func TestMCPAppsSession(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	secret := e.token("read")
	c := e.bearerClient()
	const announce = `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}},"clientInfo":{"name":"host","version":"1"}}}`
	resp, raw := c.mcpPost(secret, announce, "MCP-Protocol-Version", "2025-11-25")
	sid := resp.Header.Get(mcp.SessionHeader)
	if resp.StatusCode != 200 || !mcp.AppsSession(sid) {
		t.Fatalf("announced initialize: %d %q %s", resp.StatusCode, sid, raw)
	}
	if resp, _ := c.mcpPost(secret, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{}}}`); resp.Header.Get(mcp.SessionHeader) != "" {
		t.Fatal("session id without the announcement")
	}
	list := func(headers ...string) string {
		_, raw := c.mcpPost(secret, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`, headers...)
		return string(raw)
	}
	if strings.Contains(list(), "show_tasks") || strings.Contains(list(mcp.SessionHeader, "some-other-session"), "show_tasks") {
		t.Fatal("display tools listed without an Apps session")
	}
	if !strings.Contains(list(mcp.SessionHeader, sid), `"show_tasks"`) || !strings.Contains(list(mcp.SessionHeader, sid), "ui://opentodo/blocks/tasks") {
		t.Fatal("display tools not listed to the Apps session")
	}
	// A view needs a token like every request.
	read := `{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"ui://opentodo/blocks/tasks"}}`
	if resp, _ := c.mcpPost("", read, mcp.SessionHeader, sid); resp.StatusCode != 401 {
		t.Fatalf("view without a token: %d", resp.StatusCode)
	}
	resp, raw = c.mcpPost(secret, read)
	if resp.StatusCode != 200 || !strings.Contains(string(raw), "text/html;profile=mcp-app") {
		t.Fatalf("view: %d %s", resp.StatusCode, raw)
	}
	// Sessions hold no state: DELETE is still refused.
	req, _ := http.NewRequest("DELETE", e.srv.URL+"/mcp", nil)
	req.Header.Set("Authorization", "Bearer "+secret)
	req.Header.Set(mcp.SessionHeader, sid)
	if resp, err := http.DefaultClient.Do(req); err != nil || resp.StatusCode != 405 {
		t.Fatalf("DELETE: %v %v", resp, err)
	} else {
		resp.Body.Close()
	}

	// An encrypted account: no display tool on the server path, through the bridge yes.
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	if strings.Contains(list(mcp.SessionHeader, sid), "show_tasks") {
		t.Fatal("display tools listed to an encrypted account without the bridge")
	}
	if !strings.Contains(list(mcp.SessionHeader, sid, mcp.BridgeHeader, "decrypt"), `"show_tasks"`) {
		t.Fatal("display tools not listed through the bridge")
	}
	call := `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"show_deadlines","arguments":{"from":"2026-03-01","to":"2026-03-07"}}}`
	_, raw = c.mcpPost(secret, call, mcp.SessionHeader, sid)
	var r struct {
		Result struct {
			IsError           bool           `json:"isError"`
			StructuredContent map[string]any `json:"structuredContent"`
		} `json:"result"`
	}
	if json.Unmarshal(raw, &r) != nil || !r.Result.IsError || r.Result.StructuredContent["error"] != "encryption_enabled" {
		t.Fatalf("encrypted server path: %s", raw)
	}
}
