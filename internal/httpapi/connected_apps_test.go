package httpapi

import (
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/audit"
)

// connectedApps is the signed-in person's list of connected AI apps.
func (e *env) connectedApps() []map[string]any {
	e.t.Helper()
	resp, out := e.do("GET", connectedAppsPath, nil)
	e.mustStatus(resp, 200, out)
	raw, _ := out["grants"].([]any)
	list := make([]map[string]any, len(raw))
	for i, g := range raw {
		list[i] = g.(map[string]any)
	}
	return list
}

// mcpTokenID is the id of the signed-in person's one `MCP:` token.
func (e *env) mcpTokenID() string {
	e.t.Helper()
	resp, out := e.do("GET", "/api/v1/tokens", nil)
	e.mustStatus(resp, 200, out)
	tokens, _ := out["tokens"].([]any)
	for _, raw := range tokens {
		if tok, _ := raw.(map[string]any); strings.HasPrefix(tok["name"].(string), "MCP: ") {
			return tok["id"].(string)
		}
	}
	e.t.Fatalf("no MCP token in %v", out)
	return ""
}

// A person sees their own connected apps, disconnects one, and its tokens stop
// working; another person's grant is not theirs to see or end.
func TestConnectedAppsListAndDisconnect(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, secret := e.createOAuthClient("Gemini", "agent")
	access, refresh := e.connectOAuth(id, secret)

	m, _ := e.member("member@example.com", "10.1.0.7")
	m.connectOAuth(id, secret)
	theirs := m.connectedApps()
	if len(theirs) != 1 {
		t.Fatalf("member's list: %v", theirs)
	}

	list := e.connectedApps()
	if len(list) != 1 {
		t.Fatalf("owner's list: %v", list)
	}
	g := list[0]
	if g["clientName"] != "Gemini" || g["clientId"] != id || g["scope"] != "agent" || g["createdAt"] == nil || g["lastUsedAt"] == nil {
		t.Fatalf("grant row: %v", g)
	}
	if ws, _ := g["workspaces"].([]any); len(ws) != 0 {
		t.Fatalf("an unlimited grant lists workspaces: %v", g)
	}
	for _, k := range []string{"token_id", "tokenId", "refresh", "refreshHash"} {
		if _, ok := g[k]; ok {
			t.Fatalf("the row carries %s: %v", k, g)
		}
	}

	// Another person's grant and an unknown id are 404, and nothing changes.
	for _, gid := range []string{theirs[0]["id"].(string), "no-such-grant"} {
		resp, out := e.do("DELETE", connectedAppsPath+"/"+gid, nil)
		if resp.StatusCode != 404 || errCode(out) != "not_found" {
			t.Fatalf("delete %s: %d %v", gid, resp.StatusCode, out)
		}
	}
	if len(m.connectedApps()) != 1 {
		t.Fatal("the owner ended the member's grant")
	}

	resp, out := e.do("DELETE", connectedAppsPath+"/"+g["id"].(string), nil)
	e.mustStatus(resp, 204, out)
	if got := e.mcpPing(access); got != 401 {
		t.Fatalf("access token after disconnect: %d", got)
	}
	status, body := e.refreshOAuth(id, secret, refresh)
	if status != 400 || body["error"] != "invalid_grant" {
		t.Fatalf("refresh after disconnect: %d %v", status, body)
	}
	if len(e.connectedApps()) != 0 || e.mcpTokenCount() != 0 {
		t.Fatal("the disconnected app is still listed")
	}
	if resp, out := e.do("DELETE", connectedAppsPath+"/"+g["id"].(string), nil); resp.StatusCode != 404 {
		t.Fatalf("a second disconnect: %d %v", resp.StatusCode, out)
	}
	evs := e.events(audit.MCPOAuthDisconnectedName)
	if len(evs) != 1 || evs[0].Details["oauth_client_id"] != id || evs[0].Details["method"] != audit.DisconnectedInSettings {
		t.Fatalf("audit: %+v", evs)
	}
	if len(m.connectedApps()) != 1 {
		t.Fatal("the member's grant ended with the owner's")
	}
}

// Deleting a connected app's access token under API tokens ends its grant,
// so the refresh token cannot mint another one.
func TestDeletingTheAccessTokenEndsTheGrant(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, secret := e.createOAuthClient("Gemini", "read")
	access, refresh := e.connectOAuth(id, secret)
	personal := e.token("full")

	resp, out := e.do("DELETE", "/api/v1/tokens/"+e.mcpTokenID(), nil)
	e.mustStatus(resp, 204, out)
	if got := e.mcpPing(access); got != 401 {
		t.Fatalf("access token after delete: %d", got)
	}
	status, body := e.refreshOAuth(id, secret, refresh)
	if status != 400 || body["error"] != "invalid_grant" {
		t.Fatalf("refresh after the token was deleted: %d %v", status, body)
	}
	if len(e.connectedApps()) != 0 {
		t.Fatal("the grant is still listed")
	}
	evs := e.events(audit.MCPOAuthDisconnectedName)
	if len(evs) != 1 || evs[0].Details["method"] != audit.DisconnectedByToken {
		t.Fatalf("audit: %+v", evs)
	}
	// An ordinary token's deletion touches no grant.
	if got := e.mcpPing(personal); got != 200 {
		t.Fatalf("personal token: %d", got)
	}
}

// A demo visitor can read the (empty) list but not disconnect.
func TestConnectedAppsDemo(t *testing.T) {
	d := newDemoServer(t)
	v, _ := d.visitor()
	if got := v.connectedApps(); len(got) != 0 {
		t.Fatalf("demo list: %v", got)
	}
	resp, out := v.do("DELETE", connectedAppsPath+"/x", nil)
	if resp.StatusCode != 403 || errCode(out) != "demo_restricted" {
		t.Fatalf("demo disconnect: %d %v", resp.StatusCode, out)
	}
}

// A read or an agent token, the connected app's own access token among them,
// cannot disconnect an app; the grant keeps working.
func TestConnectedAppsRefuseReadAndAgentTokens(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, secret := e.createOAuthClient("Gemini", "agent")
	access, _ := e.connectOAuth(id, secret)
	gid := e.connectedApps()[0]["id"].(string)
	c := e.bearerClient()
	for _, tok := range []string{e.token("read"), e.token("agent"), access} {
		resp, out := c.do("DELETE", connectedAppsPath+"/"+gid, nil, bearer(tok)...)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("delete with a narrow token: %d %v", resp.StatusCode, out)
		}
	}
	if len(e.connectedApps()) != 1 || e.mcpPing(access) != 200 {
		t.Fatal("a narrow token ended the grant")
	}
}
