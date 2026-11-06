package httpapi

import (
	"net/url"
	gosync "sync"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/mcpoauth"
)

// rotatingRedirect is a client address outside Google's connector, so the
// client's refresh tokens rotate (mcp-oauth-refresh-rotation).
const rotatingRedirect = "https://assistant.example/oauth/callback"

// createRotatingClient registers a client with its own redirect address and
// returns its id and secret.
func (e *env) createRotatingClient(name string) (string, string) {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/settings/mcp/clients", map[string]any{
		"name": name, "scope": "read", "redirect_uris": []string{rotatingRedirect},
	})
	e.mustStatus(resp, 201, out)
	client, _ := out["client"].(map[string]any)
	id, _ := client["id"].(string)
	secret, _ := out["secret"].(string)
	return id, secret
}

// connectRotating runs the flow for a client registered for rotatingRedirect.
func (e *env) connectRotating(id, secret string) (string, string) {
	e.t.Helper()
	verifier, challenge := pkcePair(e.t)
	authorize := mcpAuthorizePath + "?" + url.Values{
		"response_type": {"code"}, "client_id": {id}, "redirect_uri": {rotatingRedirect},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "state": {"s"},
	}.Encode()
	status, out := e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"authorization_code"}, "code": {mustCode(e.t, e.authorizeAndAllow(authorize))},
		"redirect_uri": {rotatingRedirect}, "client_id": {id}, "client_secret": {secret}, "code_verifier": {verifier},
	})
	if status != 200 {
		e.t.Fatalf("exchange: %d %v", status, out)
	}
	access, _ := out["access_token"].(string)
	refresh, _ := out["refresh_token"].(string)
	return access, refresh
}

func (e *env) refreshOAuth(id, secret, refresh string) (int, map[string]any) {
	e.t.Helper()
	return e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"refresh_token"}, "refresh_token": {refresh}, "client_id": {id}, "client_secret": {secret},
	})
}

// Every refresh hands a rotating client a new refresh token, and the one it
// sent stops working.
func TestMCPOAuthRefreshRotates(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, secret := e.createRotatingClient("Desk app")
	access, first := e.connectRotating(id, secret)

	status, out := e.refreshOAuth(id, secret, first)
	if status != 200 {
		t.Fatalf("refresh: %d %v", status, out)
	}
	second, _ := out["refresh_token"].(string)
	access2, _ := out["access_token"].(string)
	if second == "" || second == first || access2 == "" || access2 == access {
		t.Fatalf("refresh did not rotate: %v", out)
	}
	if got := e.mcpPing(access2); got != 200 {
		t.Fatalf("the new access token answered %d", got)
	}
	status, out = e.refreshOAuth(id, secret, second)
	third, _ := out["refresh_token"].(string)
	if status != 200 || third == "" || third == second {
		t.Fatalf("second refresh: %d %v", status, out)
	}
}

// A refresh token that was already exchanged revokes the whole grant: the
// newest refresh token and the current access token stop working too, and the
// event is audited without the token.
func TestMCPOAuthRefreshReuseRevokesTheGrant(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, secret := e.createRotatingClient("Desk app")
	_, first := e.connectRotating(id, secret)
	status, out := e.refreshOAuth(id, secret, first)
	if status != 200 {
		t.Fatalf("refresh: %d %v", status, out)
	}
	second, _ := out["refresh_token"].(string)
	access, _ := out["access_token"].(string)

	// The old token comes back.
	status, out = e.refreshOAuth(id, secret, first)
	if status != 400 || out["error"] != "invalid_grant" {
		t.Fatalf("reused refresh: %d %v", status, out)
	}
	if got := e.mcpPing(access); got != 401 {
		t.Fatalf("the access token of a revoked family answered %d", got)
	}
	status, out = e.refreshOAuth(id, secret, second)
	if status != 400 || out["error"] != "invalid_grant" {
		t.Fatalf("the newest refresh token of a revoked family: %d %v", status, out)
	}
	if n := e.mcpTokenCount(); n != 0 {
		t.Fatalf("a revoked family left %d MCP tokens", n)
	}
	events := e.events(audit.MCPOAuthRefreshReusedName)
	if len(events) != 1 || events[0].Outcome != audit.Failure {
		t.Fatalf("refresh_reused events: %+v", events)
	}
	if got := events[0].Details["oauth_client_id"]; got != id {
		t.Fatalf("event client = %q, want %q", got, id)
	}

	// Authorizing again starts a new family that works.
	access, refresh := e.connectRotating(id, secret)
	if got := e.mcpPing(access); got != 200 {
		t.Fatalf("a new authorization answered %d", got)
	}
	if status, out := e.refreshOAuth(id, secret, refresh); status != 200 {
		t.Fatalf("refresh after a new authorization: %d %v", status, out)
	}
}

// Another client presenting a used token is told it is unknown and revokes
// nothing.
func TestMCPOAuthRefreshReuseNeedsTheClient(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, secret := e.createRotatingClient("Desk app")
	otherID, otherSecret := e.createRotatingClient("Other app")
	_, first := e.connectRotating(id, secret)
	_, out := e.refreshOAuth(id, secret, first)
	access, _ := out["access_token"].(string)
	if status, out := e.refreshOAuth(otherID, otherSecret, first); status != 400 || out["error"] != "invalid_grant" {
		t.Fatalf("another client's used token: %d %v", status, out)
	}
	if got := e.mcpPing(access); got != 200 {
		t.Fatalf("another client revoked the grant: %d", got)
	}
}

// Concurrent refreshes with one token are a reuse: at most one of them gets a
// new token, and the family ends with no access token left behind.
func TestMCPOAuthConcurrentRotatingRefreshRevokes(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, secret := e.createRotatingClient("Desk app")
	_, refresh := e.connectRotating(id, secret)
	var wg gosync.WaitGroup
	var mu gosync.Mutex
	ok := 0
	for range 6 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if status, _ := e.refreshOAuth(id, secret, refresh); status == 200 {
				mu.Lock()
				ok++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if ok > 1 {
		t.Fatalf("%d concurrent refreshes with one token succeeded", ok)
	}
	if n := e.mcpTokenCount(); n != 0 {
		t.Fatalf("after a reuse the person holds %d MCP tokens, want 0", n)
	}
}

// A client registered only for Google's connector keeps its refresh token, as
// Google's guide requires (mcp-oauth D6).
func TestMCPOAuthGoogleClientKeepsItsRefreshToken(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, secret := e.createOAuthClient("Gemini", "read")
	_, refresh := e.connectOAuth(id, secret)
	for range 2 {
		status, out := e.refreshOAuth(id, secret, refresh)
		if status != 200 || out["refresh_token"] != refresh {
			t.Fatalf("Google client refresh: %d %v", status, out)
		}
	}
}

func TestClientRotatesRefresh(t *testing.T) {
	for _, c := range []struct {
		redirects []string
		want      bool
	}{
		{mcpoauth.GoogleRegistration(), false},
		{[]string{googleRedirect}, false},
		{[]string{rotatingRedirect}, true},
		{append(mcpoauth.GoogleRegistration(), rotatingRedirect), true},
		{nil, true},
	} {
		if got := (mcpoauth.Client{RedirectURIs: c.redirects}).RotatesRefresh(); got != c.want {
			t.Errorf("RotatesRefresh(%v) = %v, want %v", c.redirects, got, c.want)
		}
	}
}
