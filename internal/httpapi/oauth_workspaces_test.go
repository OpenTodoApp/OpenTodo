package httpapi

import (
	"github.com/OpenTodoApp/opentodo/internal/mcpoauth"
	"net/url"
	"strings"
	"testing"
)

// An app limited to one workspace on the consent page (token-workspaces D5):
// the exchange gives an otwr_ refresh token and an otw_ access token that sees
// only that workspace, and a refresh keeps the limit.
func TestOAuthConsentLimitsWorkspaces(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	id, secret := e.createOAuthClient("Gemini", "agent")
	verifier, challenge := pkcePair(t)
	authorize := mcpAuthorizePath + "?" + url.Values{
		"response_type": {"code"}, "client_id": {id}, "redirect_uri": {googleRedirect},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "scope": {"agent"},
	}.Encode()
	restore := e.noRedirect()
	r0, err := e.client.Get(e.srv.URL + authorize)
	restore()
	if err != nil {
		t.Fatal(err)
	}
	r0.Body.Close()
	consent, _ := url.Parse(r0.Header.Get("Location"))
	query := consent.Query().Get("oauth_consent")
	// An empty choice and a foreign workspace are refused.
	for _, bad := range [][]string{{}, {"nope"}} {
		resp, out := e.do("POST", mcpConsentPath, map[string]any{"query": query, "allow": true, "workspaces": bad})
		if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
			t.Fatalf("workspaces %v: %d %v", bad, resp.StatusCode, out)
		}
	}
	resp, out = e.do("POST", mcpConsentPath, map[string]any{"query": query, "allow": true, "workspaces": []string{work}})
	e.mustStatus(resp, 200, out)
	code := mustCode(t, out["redirect"].(string))
	status, tokens := e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {googleRedirect},
		"client_id": {id}, "client_secret": {secret}, "code_verifier": {verifier},
	})
	if status != 200 {
		t.Fatalf("exchange: %d %v", status, tokens)
	}
	access, refresh := tokens["access_token"].(string), tokens["refresh_token"].(string)
	if !strings.HasPrefix(access, "otw_") || !strings.HasPrefix(refresh, "otwr_") {
		t.Fatalf("tokens = %q %q", access, refresh)
	}
	only := func(tok string) {
		t.Helper()
		ws := e.mcpTool(tok, "list_workspaces", map[string]any{})
		if s := string(mustJSON(ws)); !strings.Contains(s, work) || strings.Count(s, `"id"`) != 1 {
			t.Fatalf("list_workspaces = %s", s)
		}
	}
	only(access)
	// A binary from before the limit hashes the refresh token as it is and finds no grant.
	var n int
	if err := e.db.QueryRow("SELECT COUNT(*) FROM mcp_oauth_grant WHERE refresh_hash = ?", mcpoauth.HashSecret(refresh)).Scan(&n); err != nil || n != 0 {
		t.Fatalf("an older binary finds %d grants (%v)", n, err)
	}
	status, tokens = e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"refresh_token"}, "refresh_token": {refresh}, "client_id": {id}, "client_secret": {secret},
	})
	if status != 200 || !strings.HasPrefix(tokens["access_token"].(string), "otw_") {
		t.Fatalf("refresh: %d %v", status, tokens)
	}
	only(tokens["access_token"].(string))
}
