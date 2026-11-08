package httpapi

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/mcpoauth"
)

// The redirect addresses ChatGPT and Claude send (mcp-oauth-connector-redirects
// D1): ChatGPT's callback-id form and stable form, and Claude's two hosts.
const (
	chatgptCallbackRedirect = "https://chatgpt.com/connector/oauth/cb_9f8e7d6c5b4a"
	chatgptStableRedirect   = "https://chatgpt.com/connector_platform_oauth_redirect"
	claudeRedirect          = "https://claude.ai/api/mcp/auth_callback"
	claudeComRedirect       = "https://claude.com/api/mcp/auth_callback"
)

func platformRegistration(id string) []string {
	p, ok := mcpoauth.PlatformByID(id)
	if !ok {
		panic("unknown platform " + id)
	}
	return p.Registration()
}

// createClientWith creates a client in Settings from body and returns its
// id and secret.
func (e *env) createClientWith(body map[string]any) (string, string) {
	e.t.Helper()
	resp, out := e.do("POST", mcpClientsPath, body)
	e.mustStatus(resp, 201, out)
	client, _ := out["client"].(map[string]any)
	id, _ := client["id"].(string)
	secret, _ := out["secret"].(string)
	if id == "" || secret == "" {
		e.t.Fatalf("client create: %v", out)
	}
	return id, secret
}

// connectVia runs the whole flow for a client with the address the app names,
// and returns the access and refresh tokens.
func (e *env) connectVia(id, secret, redirect string) (string, string) {
	e.t.Helper()
	verifier, challenge := pkcePair(e.t)
	location := e.authorizeAndAllow(mcpAuthorizePath + "?" + url.Values{
		"response_type": {"code"}, "client_id": {id}, "redirect_uri": {redirect},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "state": {"st"},
	}.Encode())
	if !strings.HasPrefix(location, redirect+"?") {
		e.t.Fatalf("authorize answered %s, want %s", location, redirect)
	}
	status, out := e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"authorization_code"}, "code": {mustCode(e.t, location)}, "redirect_uri": {redirect},
		"client_id": {id}, "client_secret": {secret}, "code_verifier": {verifier},
	})
	if status != 200 {
		e.t.Fatalf("exchange via %s: %d %v", redirect, status, out)
	}
	access, _ := out["access_token"].(string)
	refresh, _ := out["refresh_token"].(string)
	return access, refresh
}

// authorizeRefused asserts that the authorize step answers 400 without a
// Location for this address.
func (e *env) authorizeRefused(id, redirect string) {
	e.t.Helper()
	_, challenge := pkcePair(e.t)
	restore := e.noRedirect()
	defer restore()
	resp, err := e.client.Get(e.srv.URL + mcpAuthorizePath + "?" + url.Values{
		"response_type": {"code"}, "client_id": {id}, "redirect_uri": {redirect},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"},
	}.Encode())
	if err != nil {
		e.t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest || resp.Header.Get("Location") != "" {
		e.t.Fatalf("%s: %d %q", redirect, resp.StatusCode, resp.Header.Get("Location"))
	}
}

// ChatGPT and Claude register themselves with their own addresses and complete
// the flow; look-alikes and a mix of platforms are refused.
func TestMCPOAuthDynamicRegistrationPlatforms(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	// Each registration comes from its own address, under the per-address limit.
	n := 0
	from := func() string { n++; return fmt.Sprintf("203.0.113.%d", n) }
	for _, c := range []struct{ redirect, name string }{
		{chatgptCallbackRedirect, "ChatGPT"},
		{chatgptStableRedirect, "ChatGPT"},
		{claudeRedirect, "Claude"},
		{claudeComRedirect, "Claude"},
	} {
		resp, out := e.do("POST", mcpRegisterPath, map[string]any{"redirect_uris": []string{c.redirect}}, "X-Forwarded-For", from())
		e.mustStatus(resp, 201, out)
		id, _ := out["client_id"].(string)
		secret, _ := out["client_secret"].(string)
		if id == "" || secret == "" || out["scope"] != "read" || out["client_name"] != c.name {
			t.Fatalf("%s registration: %v", c.redirect, out)
		}
		access, _ := e.connectVia(id, secret, c.redirect)
		if got := e.mcpPing(access); got != 200 {
			t.Fatalf("%s: /mcp answered %d", c.redirect, got)
		}
	}
	for _, bad := range [][]string{
		{"https://chatgpt.com.evil.example/connector_platform_oauth_redirect"},
		{"https://claude.ai/api/mcp/auth_callback/x"},
		{"https://chatgpt.com/connector/oauth/a/b"},
		{"https://chat.openai.com/connector_platform_oauth_redirect"},
		{"http://localhost:3118/callback"},
		{claudeRedirect, chatgptStableRedirect},
		{claudeRedirect, "https://evil.example/cb"},
	} {
		resp, out := e.do("POST", mcpRegisterPath, map[string]any{"client_name": "x", "redirect_uris": bad}, "X-Forwarded-For", from())
		if resp.StatusCode != 400 || out["error"] != "invalid_redirect_uri" {
			t.Fatalf("%v: %d %v", bad, resp.StatusCode, out)
		}
	}
}

// A client created in Settings for ChatGPT or Claude accepts that app's
// addresses, rotates its refresh token, and accepts no other app's address.
func TestMCPOAuthPlatformClients(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)

	resp, out := e.do("GET", mcpClientsPath, nil)
	e.mustStatus(resp, 200, out)
	platforms, _ := out["platforms"].([]any)
	if len(platforms) != 3 {
		t.Fatalf("platforms = %v", out["platforms"])
	}

	gpt, gptSecret := e.createClientWith(map[string]any{"name": "ChatGPT", "scope": "read", "platform": "openai"})
	for _, redirect := range []string{chatgptCallbackRedirect, chatgptStableRedirect} {
		e.connectVia(gpt, gptSecret, redirect)
	}
	e.authorizeRefused(gpt, googleRedirect)
	e.authorizeRefused(gpt, claudeRedirect)
	e.authorizeRefused(gpt, "https://chatgpt.com/connector/oauth/a/b")

	claude, claudeSecret := e.createClientWith(map[string]any{"name": "Claude", "scope": "read", "platform": "anthropic"})
	e.connectVia(claude, claudeSecret, claudeComRedirect)
	_, refresh := e.connectVia(claude, claudeSecret, claudeRedirect)
	e.authorizeRefused(claude, chatgptStableRedirect)
	e.authorizeRefused(claude, "https://claude.ai.evil.example/api/mcp/auth_callback")
	// Claude's client rotates its refresh token (design D5).
	status, out := e.refreshOAuth(claude, claudeSecret, refresh)
	if next, _ := out["refresh_token"].(string); status != 200 || next == "" || next == refresh {
		t.Fatalf("Claude refresh: %d %v", status, out)
	}

	for _, body := range []map[string]any{
		{"name": "x", "platform": "chat.openai.com"},
		{"name": "x", "platform": "openai", "redirect_uris": []string{"https://assistant.example/cb"}},
	} {
		resp, out := e.do("POST", mcpClientsPath, body)
		if resp.StatusCode != 400 || errCode(out) != "bad_request" {
			t.Fatalf("%v: %d %v", body, resp.StatusCode, out)
		}
	}
}

// A custom address is an exact https address, and nothing near it is accepted.
func TestMCPOAuthCustomRedirect(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	const custom = "https://assistant.example/oauth/callback"
	id, secret := e.createClientWith(map[string]any{"name": "Desk", "scope": "read", "redirect_uris": []string{custom}})
	e.connectVia(id, secret, custom)
	for _, near := range []string{custom + "/x", custom + "x", "https://assistant.example/oauth/", "http://assistant.example/oauth/callback"} {
		e.authorizeRefused(id, near)
	}

	slash, _ := e.createClientWith(map[string]any{"name": "Slash", "scope": "read", "redirect_uris": []string{"https://assistant.example/cb/"}})
	e.authorizeRefused(slash, "https://assistant.example/cb/other")

	many := make([]string, mcpoauth.MaxCustomRedirects+1)
	for i := range many {
		many[i] = "https://assistant.example/cb" + strings.Repeat("x", i)
	}
	for _, uris := range [][]string{
		{"http://assistant.example/cb"},
		{"https://*.example/cb"},
		{"https://assistant.example/cb#x"},
		{"https://user@assistant.example/cb"},
		{"assistant.example/cb"},
		many,
	} {
		resp, out := e.do("POST", mcpClientsPath, map[string]any{"name": "x", "redirect_uris": uris})
		if resp.StatusCode != 400 || errCode(out) != "invalid_redirect_uri" {
			t.Fatalf("%v: %d %v", uris, resp.StatusCode, out)
		}
	}
	resp, out := e.do("GET", mcpClientsPath, nil)
	e.mustStatus(resp, 200, out)
	if clients, _ := out["clients"].([]any); len(clients) != 2 {
		t.Fatalf("a refused address created a client: %v", out["clients"])
	}
}
