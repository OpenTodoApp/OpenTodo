package cli

import (
	"encoding/json"
	"io"
	"strings"
	"testing"
)

// `ot token create --workspace` resolves the name and limits the token
// (token-workspaces): its secret starts with otw_ and it sees only that
// workspace; an unknown name exits 2 before anything is created.
func TestTokenCreateWithWorkspace(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	resp := h.api("POST", "/api/v1/workspaces", map[string]any{"name": "Work"}, h.apiToken)
	var ws struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&ws)
	resp.Body.Close()
	if ws.ID == "" {
		t.Fatalf("workspace not created: %d", resp.StatusCode)
	}
	code, out, errb := h.run("token", "create", "work-assistant", "--scope", "agent", "--limit-to", "work")
	secret := strings.TrimSpace(out)
	if code != 0 || !strings.HasPrefix(secret, "otw_") || !strings.Contains(errb, "only the workspaces work") {
		t.Fatalf("token create: %d %q %q", code, out, errb)
	}
	resp = h.api("GET", "/api/v1/workspaces", nil, secret)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !strings.Contains(string(body), ws.ID) || strings.Count(string(body), `"id"`) != 1 {
		t.Fatalf("workspaces with the token: %d %s", resp.StatusCode, body)
	}
	if code, _, _ := h.run("token", "create", "x", "--limit-to", "Nope"); code != ExitUsage {
		t.Fatalf("unknown workspace exit = %d", code)
	}
}
