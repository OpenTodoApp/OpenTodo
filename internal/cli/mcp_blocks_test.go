package cli

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/mcp"
)

// TestMCPBridgeHeadersMatch keeps the bridge's header names equal to the server's.
func TestMCPBridgeHeadersMatch(t *testing.T) {
	if mcpSessionHeader != mcp.SessionHeader || mcpBridgeHeader != mcp.BridgeHeader {
		t.Fatal("bridge header names differ from internal/mcp")
	}
	for name := range displayTools {
		found := false
		for _, n := range []string{"show_tasks", "show_calendar", "show_deadlines"} {
			found = found || n == name
		}
		if !found {
			t.Fatalf("display tool %s", name)
		}
	}
}

// TestMCPBridgeBlocks (mcp-blocks D4, D6): a host announcing MCP Apps through
// `ot mcp --decrypt` keeps its session, is offered the display tools of an
// encrypted account, and gets the block's rows decrypted on this machine while
// the text the model reads stays the server's kind and count. The tasks are the
// fixture internal/mcp's server test shows.
func TestMCPBridgeBlocks(t *testing.T) {
	raw, err := os.ReadFile("../mcp/testdata/blocks/encrypted.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Date      string            `json:"date"`
		IDs       []string          `json:"ids"`
		Plaintext map[string]string `json:"plaintext"`
		Encrypted []string          `json:"encrypted"`
	}
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	h := newHarness(t)
	h.env["OPENTODO_URL"] = h.srv.URL
	h.env["OPENTODO_TOKEN"] = h.agentToken()
	dek := seqBytes(0x40, 32)
	h.encrypted(1, dek)
	for id, title := range fx.Plaintext {
		for _, e := range fx.Encrypted {
			if e == id {
				title = h.seal(dek, "task", id, "title", title)
			}
		}
		h.put("task", id, map[string]any{"title": title, "project_id": nil, "labels": []string{}, "due": map[string]any{"date": fx.Date}})
	}
	h.mustRun("encryption", "unlock", "--passphrase-file", h.passphraseFile())

	announce := map[string]any{"method": "initialize", "params": map[string]any{"protocolVersion": "2025-11-25",
		"capabilities": map[string]any{"extensions": map[string]any{"io.modelcontextprotocol/ui": map[string]any{"mimeTypes": []string{"text/html;profile=mcp-app"}}}},
		"clientInfo":   map[string]any{"name": "host", "version": "1"}}}
	code, lines, errb := h.bridge([]string{"--decrypt"},
		announce,
		map[string]any{"method": "tools/list", "params": map[string]any{}},
		toolCall("show_tasks", map[string]any{"ids": fx.IDs}),
		map[string]any{"method": "resources/read", "params": map[string]any{"uri": "ui://opentodo/blocks/tasks"}},
	)
	if code != 0 || len(lines) != 4 {
		t.Fatalf("bridge: %d %v %s", code, lines, errb)
	}
	list, _ := json.Marshal(lines[1])
	if !strings.Contains(string(list), `"show_tasks"`) {
		t.Fatalf("display tools not listed through the bridge: %s", list)
	}
	sc := structured(t, lines[2])
	rows := sc["tasks"].([]any)
	if len(rows) != len(fx.IDs) {
		t.Fatalf("rows %v", rows)
	}
	for i, id := range fx.IDs {
		row := rows[i].(map[string]any)
		if row["id"] != id || row["untrusted_text"].(map[string]any)["title"] != fx.Plaintext[id] || row["encrypted"] == true {
			t.Fatalf("row %d = %v", i, row)
		}
	}
	text := lines[2]["result"].(map[string]any)["content"].([]any)[0].(map[string]any)["text"].(string)
	for _, pt := range fx.Plaintext {
		if strings.Contains(text, pt) {
			t.Fatalf("plaintext reached the model's text: %s", text)
		}
	}
	view := lines[3]["result"].(map[string]any)["contents"].([]any)[0].(map[string]any)
	if view["mimeType"] != "text/html;profile=mcp-app" || !strings.HasPrefix(view["text"].(string), "<!DOCTYPE html>") {
		t.Fatalf("view through the bridge: %v", view["mimeType"])
	}
}
