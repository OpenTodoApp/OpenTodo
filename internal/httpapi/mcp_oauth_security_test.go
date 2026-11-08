package httpapi

import (
	"encoding/json"
	"net/url"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/mcpoauth"
)

// oauthAuthorizeURL is an authorize address for client id with the env's PKCE
// pair, as Gemini sends it.
func oauthAuthorizeURL(t *testing.T, id string) (string, string) {
	t.Helper()
	verifier, challenge := pkcePair(t)
	return mcpAuthorizePath + "?" + url.Values{
		"response_type": {"code"}, "client_id": {id}, "redirect_uri": {googleRedirect},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "state": {"s"},
	}.Encode(), verifier
}

// connectOAuth runs the whole flow for a client and returns its access and
// refresh tokens.
func (e *env) connectOAuth(id, secret string) (string, string) {
	e.t.Helper()
	authorize, verifier := oauthAuthorizeURL(e.t, id)
	status, out := e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"authorization_code"}, "code": {mustCode(e.t, e.authorizeAndAllow(authorize))},
		"redirect_uri": {googleRedirect}, "client_id": {id}, "client_secret": {secret}, "code_verifier": {verifier},
	})
	if status != 200 {
		e.t.Fatalf("exchange: %d %v", status, out)
	}
	access, _ := out["access_token"].(string)
	refresh, _ := out["refresh_token"].(string)
	return access, refresh
}

func (e *env) mcpPing(token string) int {
	e.t.Helper()
	b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "ping"})
	resp, _ := e.bearerClient().mcpPost(token, string(b))
	return resp.StatusCode
}

// signInAgain signs the owner in once more after the clock moved past the
// session's lifetime.
func (e *env) signInAgain() {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 200, out)
}

// mcpTokenCount is how many `MCP:` tokens the signed-in person holds.
func (e *env) mcpTokenCount() int {
	e.t.Helper()
	resp, out := e.do("GET", "/api/v1/tokens", nil)
	e.mustStatus(resp, 200, out)
	tokens, _ := out["tokens"].([]any)
	n := 0
	for _, raw := range tokens {
		if tok, _ := raw.(map[string]any); strings.HasPrefix(tok["name"].(string), "MCP: ") {
			n++
		}
	}
	return n
}

// A link to the authorize address alone never hands out a code: the browser
// lands on the consent screen, and only Allow there issues one (D5).
func TestMCPOAuthAuthorizeNeedsConsent(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, _ := e.createOAuthClient("Gemini", "agent")
	authorize, _ := oauthAuthorizeURL(t, id)
	restore := e.noRedirect()
	defer restore()
	resp, err := e.client.Get(e.srv.URL + authorize)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	location := resp.Header.Get("Location")
	if resp.StatusCode != 302 || strings.Contains(location, "code=") || !strings.HasPrefix(location, "/?oauth_consent=") {
		t.Fatalf("authorize with a session: %d %s", resp.StatusCode, location)
	}
	query := strings.SplitN(authorize, "?", 2)[1]

	// The screen learns who asks and for what.
	r, info := e.do("GET", mcpConsentPath+"?"+query, nil)
	e.mustStatus(r, 200, info)
	client, _ := info["client"].(map[string]any)
	if client["name"] != "Gemini" || info["scope"] != "agent" || info["redirectHost"] != "oauth-redirect.googleusercontent.com" {
		t.Fatalf("consent info: %v", info)
	}

	// Deny sends the browser back with access_denied and no code.
	r, out := e.do("POST", mcpConsentPath, map[string]any{"query": query, "allow": false})
	e.mustStatus(r, 200, out)
	denied, _ := out["redirect"].(string)
	if !strings.HasPrefix(denied, googleRedirect) || !strings.Contains(denied, "error=access_denied") || strings.Contains(denied, "code=") {
		t.Fatalf("deny: %s", denied)
	}

	// An API token cannot answer for the person: the consent is a browser step.
	plain := e.token("full")
	r, out = e.bearerClient().do("POST", mcpConsentPath, map[string]any{"query": query, "allow": true}, bearer(plain)...)
	if r.StatusCode != 401 && r.StatusCode != 403 {
		t.Fatalf("consent with a token: %d %v", r.StatusCode, out)
	}

	// A request for a redirect the client did not register is refused outright.
	bad := strings.Replace(query, url.QueryEscape(googleRedirect), url.QueryEscape("https://evil.example/cb"), 1)
	r, out = e.do("POST", mcpConsentPath, map[string]any{"query": bad, "allow": true})
	if r.StatusCode != 400 || out["redirect"] != nil {
		t.Fatalf("consent for a foreign redirect: %d %v", r.StatusCode, out)
	}
}

// An access token stops working after an hour even if nobody refreshes or
// revokes it (D6).
func TestMCPOAuthAccessTokenExpires(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	e.now.Freeze(time.Now())
	id, secret := e.createOAuthClient("Gemini", "read")
	access, refresh := e.connectOAuth(id, secret)
	if got := e.mcpPing(access); got != 200 {
		t.Fatalf("fresh access token: %d", got)
	}
	e.now.Advance(mcpoauth.AccessTTL + time.Minute)
	if got := e.mcpPing(access); got != 401 {
		t.Fatalf("access token after its hour: %d", got)
	}
	e.signInAgain()
	if n := e.mcpTokenCount(); n != 0 {
		t.Fatalf("the token list shows %d expired MCP tokens", n)
	}
	// The refresh token still works and the new access token does.
	status, out := e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"refresh_token"}, "refresh_token": {refresh}, "client_id": {id}, "client_secret": {secret},
	})
	if status != 200 {
		t.Fatalf("refresh: %d %v", status, out)
	}
	if got := e.mcpPing(out["access_token"].(string)); got != 200 {
		t.Fatalf("refreshed token: %d", got)
	}
}

// Revocation authenticates the client and touches only that client's tokens:
// a pasted personal token and another client's grant are left alone (D8).
func TestMCPOAuthRevokeIsScopedToTheClient(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	idA, secretA := e.createOAuthClient("A", "read")
	idB, secretB := e.createOAuthClient("B", "read")
	accessA, refreshA := e.connectOAuth(idA, secretA)
	personal := e.token("full")

	// Without the client's credentials nothing is revoked.
	status, _ := e.oauthForm(mcpRevokePath, url.Values{"token": {refreshA}})
	if status != 401 {
		t.Fatalf("revoke without client credentials: %d", status)
	}
	status, _ = e.oauthForm(mcpRevokePath, url.Values{"token": {refreshA}, "client_id": {idA}, "client_secret": {"wrong"}})
	if status != 401 {
		t.Fatalf("revoke with a wrong secret: %d", status)
	}
	// A personal token posted by a client is answered 200 and kept.
	status, _ = e.oauthForm(mcpRevokePath, url.Values{"token": {personal}, "client_id": {idB}, "client_secret": {secretB}})
	if status != 200 {
		t.Fatalf("revoke of a personal token: %d", status)
	}
	if got := e.mcpPing(personal); got != 200 {
		t.Fatalf("the personal token was deleted: %d", got)
	}
	// Client B cannot revoke client A's grant, by either token.
	for _, tok := range []string{refreshA, accessA} {
		if status, _ := e.oauthForm(mcpRevokePath, url.Values{"token": {tok}, "client_id": {idB}, "client_secret": {secretB}}); status != 200 {
			t.Fatalf("cross-client revoke: %d", status)
		}
	}
	if got := e.mcpPing(accessA); got != 200 {
		t.Fatalf("another client revoked A's grant: %d", got)
	}
	// Client A revokes its own grant with its access token.
	if status, _ := e.oauthForm(mcpRevokePath, url.Values{"token": {accessA}, "client_id": {idA}, "client_secret": {secretA}}); status != 200 {
		t.Fatalf("own revoke: %d", status)
	}
	if got := e.mcpPing(accessA); got != 401 {
		t.Fatalf("revoked access token: %d", got)
	}
	status, out := e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"refresh_token"}, "refresh_token": {refreshA}, "client_id": {idA}, "client_secret": {secretA},
	})
	if status != 400 || out["error"] != "invalid_grant" {
		t.Fatalf("refresh after revoke: %d %v", status, out)
	}
}

// Concurrent refreshes of one grant leave exactly one access token behind,
// so no token survives without a grant that revoking can reach (D6).
func TestMCPOAuthConcurrentRefreshLeavesOneToken(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, secret := e.createOAuthClient("Gemini", "read")
	_, refresh := e.connectOAuth(id, secret)
	var wg gosync.WaitGroup
	for range 6 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			e.oauthForm(mcpTokenPath, url.Values{
				"grant_type": {"refresh_token"}, "refresh_token": {refresh}, "client_id": {id}, "client_secret": {secret},
			})
		}()
	}
	wg.Wait()
	if n := e.mcpTokenCount(); n != 1 {
		t.Fatalf("after concurrent refreshes the person holds %d MCP tokens, want 1", n)
	}
	resp, _ := e.do("DELETE", "/api/v1/settings/mcp/clients/"+id, nil)
	if resp.StatusCode != 204 {
		t.Fatalf("delete client: %d", resp.StatusCode)
	}
	if n := e.mcpTokenCount(); n != 0 {
		t.Fatalf("deleting the client left %d MCP tokens", n)
	}
}

// Anonymous registration is rate limited per address, and clients nobody
// authorized within a day are removed (D3).
func TestMCPOAuthRegistrationIsBounded(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	e.now.Freeze(time.Now())
	anon := newClientAt(e, "198.51.100.40")
	register := func(c *env) int {
		resp, _ := c.do("POST", mcpRegisterPath, map[string]any{"client_name": "Google", "redirect_uris": []string{googleRedirect}})
		return resp.StatusCode
	}
	for i := range 5 {
		if got := register(anon); got != 201 {
			t.Fatalf("registration %d: %d", i+1, got)
		}
	}
	if got := register(anon); got != 429 {
		t.Fatalf("sixth registration in a minute: %d", got)
	}
	resp, out := e.do("GET", mcpClientsPath, nil)
	e.mustStatus(resp, 200, out)
	if clients, _ := out["clients"].([]any); len(clients) != 5 {
		t.Fatalf("clients = %d, want 5", len(clients))
	}
	// A day later, the next registration removes the five nobody authorized.
	e.now.Advance(25 * time.Hour)
	if got := register(newClientAt(e, "198.51.100.41")); got != 201 {
		t.Fatalf("registration a day later: %d", got)
	}
	e.signInAgain()
	resp, out = e.do("GET", mcpClientsPath, nil)
	e.mustStatus(resp, 200, out)
	if clients, _ := out["clients"].([]any); len(clients) != 1 {
		t.Fatalf("after pruning clients = %d, want 1", len(clients))
	}
}
