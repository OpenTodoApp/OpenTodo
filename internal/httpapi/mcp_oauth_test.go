package httpapi

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/mcpoauth"
)

// pkcePair is a verifier and its S256 challenge, the only method the server
// accepts (mcp-oauth D4).
func pkcePair(t *testing.T) (string, string) {
	t.Helper()
	verifier := strings.Repeat("aB3-_.~", 9) // 54 characters, all unreserved
	sum := sha256.Sum256([]byte(verifier))
	return verifier, base64.RawURLEncoding.EncodeToString(sum[:])
}

// noRedirect makes the env's client answer a redirect instead of following it,
// which is what the authorize step has to be inspected with.
func (e *env) noRedirect() func() {
	e.t.Helper()
	old := e.client.CheckRedirect
	e.client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return func() { e.client.CheckRedirect = old }
}

// oauthForm posts a form to an OAuth endpoint and returns the status and the
// decoded JSON body.
func (e *env) oauthForm(path string, form url.Values) (int, map[string]any) {
	e.t.Helper()
	req, err := http.NewRequest("POST", e.srv.URL+path, strings.NewReader(form.Encode()))
	if err != nil {
		e.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := e.client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return resp.StatusCode, out
}

// createOAuthClient registers a client as the signed-in owner and returns its
// id and secret.
func (e *env) createOAuthClient(name, scope string) (string, string) {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/settings/mcp/clients", map[string]any{"name": name, "scope": scope})
	e.mustStatus(resp, 201, out)
	client, _ := out["client"].(map[string]any)
	id, _ := client["id"].(string)
	secret, _ := out["secret"].(string)
	if id == "" || secret == "" {
		e.t.Fatalf("client create: %v", out)
	}
	if _, leaked := client["secret"]; leaked {
		e.t.Fatalf("the client view carries a secret: %v", client)
	}
	return id, secret
}

const googleRedirect = "https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-1-2"

func TestMCPOAuthDiscovery(t *testing.T) {
	e := ownerEnv(t)
	// Off with MCP: an endpoint that does not exist yet advertises nothing.
	for _, path := range []string{mcpProtectedResourcePath, mcpProtectedResourcePath + "/mcp", "/.well-known/oauth-authorization-server"} {
		resp, out := e.do("GET", path, nil)
		if resp.StatusCode != 404 {
			t.Fatalf("%s while MCP is off: %d %v", path, resp.StatusCode, out)
		}
	}
	e.enableMCP(true)
	origin := "http://" + strings.TrimPrefix(e.srv.URL, "http://")
	for _, path := range []string{mcpProtectedResourcePath, mcpProtectedResourcePath + "/mcp"} {
		resp, out := e.do("GET", path, nil)
		e.mustStatus(resp, 200, out)
		if out["resource"] != origin+"/mcp" {
			t.Fatalf("%s resource = %v", path, out["resource"])
		}
		servers, _ := out["authorization_servers"].([]any)
		if len(servers) != 1 || servers[0] != origin {
			t.Fatalf("%s authorization_servers = %v", path, out["authorization_servers"])
		}
	}
	resp, out := e.do("GET", "/.well-known/oauth-authorization-server", nil)
	e.mustStatus(resp, 200, out)
	for field, want := range map[string]string{
		"authorization_endpoint": origin + mcpAuthorizePath,
		"token_endpoint":         origin + mcpTokenPath,
		"registration_endpoint":  origin + mcpRegisterPath,
		"revocation_endpoint":    origin + mcpRevokePath,
		"issuer":                 origin,
	} {
		if out[field] != want {
			t.Fatalf("%s = %v, want %v", field, out[field], want)
		}
	}
	// The Gemini app checks these three before it will connect.
	grantTypes, _ := out["grant_types_supported"].([]any)
	if len(grantTypes) != 2 || grantTypes[0] != "authorization_code" || grantTypes[1] != "refresh_token" {
		t.Fatalf("grant_types_supported = %v", out["grant_types_supported"])
	}
	methods, _ := out["code_challenge_methods_supported"].([]any)
	if len(methods) != 1 || methods[0] != "S256" {
		t.Fatalf("code_challenge_methods_supported = %v", out["code_challenge_methods_supported"])
	}
	types, _ := out["response_types_supported"].([]any)
	if len(types) != 1 || types[0] != "code" {
		t.Fatalf("response_types_supported = %v", out["response_types_supported"])
	}
}

func TestMCPOAuthDynamicRegistrationIsGoogleOnly(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	resp0, out0 := e.do("POST", mcpRegisterPath, map[string]any{})
	if resp0.StatusCode != 400 || out0["error"] != "invalid_redirect_uri" {
		t.Fatalf("empty registration: %d %v", resp0.StatusCode, out0)
	}
	// A registration from an arbitrary site is refused: otherwise any website
	// could register a client and then collect a code (design D3).
	resp, out := e.do("POST", mcpRegisterPath, map[string]any{
		"client_name": "Evil", "redirect_uris": []string{"https://evil.example/cb"},
	})
	if resp.StatusCode != 400 || out["error"] != "invalid_redirect_uri" {
		t.Fatalf("foreign redirect: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", mcpRegisterPath, map[string]any{
		"client_name": "Google", "redirect_uris": []string{googleRedirect},
	})
	e.mustStatus(resp, 201, out)
	id, _ := out["client_id"].(string)
	secret, _ := out["client_secret"].(string)
	if id == "" || secret == "" || out["scope"] != "read" {
		t.Fatalf("google registration: %v", out)
	}
	// The registered client can run the flow with the address Gemini names.
	verifier, challenge := pkcePair(t)
	restore := e.noRedirect()
	defer restore()
	authorize := mcpAuthorizePath + "?" + url.Values{
		"response_type": {"code"}, "client_id": {id}, "redirect_uri": {googleRedirect},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "state": {"st"},
	}.Encode()
	resp2, err := e.client.Get(e.srv.URL + authorize)
	if err != nil {
		t.Fatal(err)
	}
	resp2.Body.Close()
	if resp2.StatusCode != 302 || !strings.HasPrefix(resp2.Header.Get("Location"), googleRedirect) {
		t.Fatalf("authorize with a dynamic client: %d %s", resp2.StatusCode, resp2.Header.Get("Location"))
	}
	code := mustCode(t, resp2.Header.Get("Location"))
	status, tok := e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {googleRedirect},
		"client_id": {id}, "client_secret": {secret}, "code_verifier": {verifier},
	})
	if status != 200 || tok["access_token"] == "" || tok["access_token"] == nil {
		t.Fatalf("exchange: %d %v", status, tok)
	}
	if tok["scope"] != "read" {
		t.Fatalf("dynamic client scope = %v", tok["scope"])
	}
}

func TestMCPOAuthCodeFlow(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	id, secret := e.createOAuthClient("Gemini", "agent")
	verifier, challenge := pkcePair(t)
	// The authorize step answers with a redirect to Google's connector address;
	// none of these requests may follow it.
	restoreOwner := e.noRedirect()
	defer restoreOwner()

	// The authorize step sends the browser to sign in when it has no session,
	// rather than issuing a code (design D5).
	anon := e.bearerClient()
	restore := anon.noRedirect()
	defer restore()
	authorizeURL := mcpAuthorizePath + "?" + url.Values{
		"response_type": {"code"}, "client_id": {id}, "redirect_uri": {googleRedirect},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "scope": {"agent"}, "state": {"s1"},
	}.Encode()
	resp, err := anon.client.Get(e.srv.URL + authorizeURL)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 302 || !strings.HasPrefix(resp.Header.Get("Location"), "/?oauth=") {
		t.Fatalf("anonymous authorize: %d %s", resp.StatusCode, resp.Header.Get("Location"))
	}

	// An unregistered redirect is never redirected to.
	bad := mcpAuthorizePath + "?" + url.Values{
		"response_type": {"code"}, "client_id": {id}, "redirect_uri": {"https://elsewhere.example/cb"},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"},
	}.Encode()
	resp, err = e.client.Get(e.srv.URL + bad)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 400 || resp.Header.Get("Location") != "" {
		t.Fatalf("foreign redirect: %d %q", resp.StatusCode, resp.Header.Get("Location"))
	}

	// The signed-in person gets a code bound to the registered address.
	authorize := mcpAuthorizePath + "?" + url.Values{
		"response_type": {"code"}, "client_id": {id}, "redirect_uri": {googleRedirect},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "scope": {"agent"}, "state": {"s1"},
	}.Encode()
	resp, err = e.client.Get(e.srv.URL + authorize)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 302 {
		t.Fatalf("authorize: %d %s %s", resp.StatusCode, resp.Header.Get("Location"), body)
	}
	location := resp.Header.Get("Location")
	if !strings.HasPrefix(location, googleRedirect) || !strings.Contains(location, "state=s1") {
		t.Fatalf("authorize location: %s", location)
	}
	code := mustCode(t, location)

	// A verifier that does not match the challenge exchanges nothing.
	other := strings.Repeat("zY9-_.~", 9)
	status, out := e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {googleRedirect},
		"client_id": {id}, "client_secret": {secret}, "code_verifier": {other},
	})
	if status != 400 || out["error"] != "invalid_grant" {
		t.Fatalf("bad PKCE: %d %v", status, out)
	}

	// The real exchange mints an access token and a refresh token.
	authorizeCode := func() string {
		resp, err := e.client.Get(e.srv.URL + authorize)
		if err != nil {
			e.t.Fatal(err)
		}
		resp.Body.Close()
		return mustCode(t, resp.Header.Get("Location"))
	}
	code = authorizeCode()
	status, out = e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {googleRedirect},
		"client_id": {id}, "client_secret": {secret}, "code_verifier": {verifier},
	})
	if status != 200 {
		t.Fatalf("exchange: %d %v", status, out)
	}
	access, _ := out["access_token"].(string)
	refresh, _ := out["refresh_token"].(string)
	if access == "" || refresh == "" || out["token_type"] != "Bearer" || out["scope"] != "agent" {
		t.Fatalf("token response: %v", out)
	}

	// The token is an API token: /mcp answers for the person who authorized it.
	bc := e.bearerClient()
	b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "ping"})
	resp2, raw := bc.mcpPost(access, string(b))
	if resp2.StatusCode != 200 {
		t.Fatalf("ping with an OAuth token: %d %s", resp2.StatusCode, raw)
	}

	// A code is single use.
	status, out = e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {googleRedirect},
		"client_id": {id}, "client_secret": {secret}, "code_verifier": {verifier},
	})
	if status != 400 || out["error"] != "invalid_grant" {
		t.Fatalf("second exchange: %d %v", status, out)
	}

	// A refresh returns the same refresh token and a new access token; the old
	// access token stops working (design D6).
	status, out = e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"refresh_token"}, "refresh_token": {refresh}, "client_id": {id}, "client_secret": {secret},
	})
	if status != 200 || out["refresh_token"] != refresh {
		t.Fatalf("refresh: %d %v", status, out)
	}
	refreshed, _ := out["access_token"].(string)
	if refreshed == "" || refreshed == access {
		t.Fatalf("refresh minted %q", refreshed)
	}
	if resp3, _ := bc.mcpPost(access, string(b)); resp3.StatusCode != 401 {
		t.Fatalf("the replaced access token answered %d", resp3.StatusCode)
	}
	if resp3, raw := bc.mcpPost(refreshed, string(b)); resp3.StatusCode != 200 {
		t.Fatalf("the refreshed access token answered %d %s", resp3.StatusCode, raw)
	}

	// Revoking the refresh token ends the grant.
	status, _ = e.oauthForm(mcpRevokePath, url.Values{"token": {refresh}, "client_id": {id}, "client_secret": {secret}})
	if status != 200 {
		t.Fatalf("revoke: %d", status)
	}
	status, out = e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"refresh_token"}, "refresh_token": {refresh}, "client_id": {id}, "client_secret": {secret},
	})
	if status != 400 || out["error"] != "invalid_grant" {
		t.Fatalf("refresh after revoke: %d %v", status, out)
	}
}

func TestMCPOAuthClientRoutes(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	// A member cannot create or delete clients.
	m, _ := e.member("member@example.com", "198.51.100.9")
	resp, out := m.do("POST", "/api/v1/settings/mcp/clients", map[string]any{"name": "x", "scope": "read"})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member create: %d %v", resp.StatusCode, out)
	}
	id, secret := e.createOAuthClient("Gemini", "read")
	resp, out = e.do("GET", "/api/v1/settings/mcp/clients", nil)
	e.mustStatus(resp, 200, out)
	clients, _ := out["clients"].([]any)
	if len(clients) != 1 {
		t.Fatalf("clients = %v", out["clients"])
	}
	view := clients[0].(map[string]any)
	if view["secret_set"] != true || view["secret"] != nil {
		t.Fatalf("client view: %v", view)
	}
	if out["resource"] == "" || out["discovery_url"] == "" {
		t.Fatalf("addresses: %v", out)
	}

	// Deleting the client cuts off the grant it had (design D8).
	verifier, challenge := pkcePair(t)
	restore := e.noRedirect()
	defer restore()
	resp, err := e.client.Get(e.srv.URL + mcpAuthorizePath + "?" + url.Values{
		"response_type": {"code"}, "client_id": {id}, "redirect_uri": {googleRedirect},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"},
	}.Encode())
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 302 {
		t.Fatalf("authorize: %d", resp.StatusCode)
	}
	status, out := e.oauthForm(mcpTokenPath, url.Values{
		"grant_type": {"authorization_code"}, "code": {mustCode(t, resp.Header.Get("Location"))}, "redirect_uri": {googleRedirect},
		"client_id": {id}, "client_secret": {secret}, "code_verifier": {verifier},
	})
	if status != 200 {
		t.Fatalf("exchange: %d %v", status, out)
	}
	access, _ := out["access_token"].(string)
	bc := e.bearerClient()
	ping, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "ping"})
	if r1, _ := bc.mcpPost(access, string(ping)); r1.StatusCode != 200 {
		t.Fatalf("before deletion: %d", r1.StatusCode)
	}
	resp, _ = e.do("DELETE", "/api/v1/settings/mcp/clients/"+id, nil)
	if resp.StatusCode != 204 {
		t.Fatalf("delete: %d", resp.StatusCode)
	}
	if r2, _ := bc.mcpPost(access, string(ping)); r2.StatusCode != 401 {
		t.Fatalf("after deleting the client: %d", r2.StatusCode)
	}
}

func TestGrantedScopeFollowsTheClient(t *testing.T) {
	// An `agent` client stays agent even when the request asks for read: Gemini
	// asks for the first scope the metadata lists, which is read.
	for _, requested := range []string{"", "read", "agent", "read agent", "openid read"} {
		if got := grantedScope(mcpoauth.ScopeAgent, requested); got != mcpoauth.ScopeAgent {
			t.Fatalf("agent client, requested %q: %q", requested, got)
		}
	}
	if got := grantedScope(mcpoauth.ScopeRead, ""); got != mcpoauth.ScopeRead {
		t.Fatalf("read client without a request: %q", got)
	}
	// A read client cannot be widened by asking.
	if got := grantedScope(mcpoauth.ScopeRead, "agent"); got != mcpoauth.ScopeRead {
		t.Fatalf("read client asking for agent: %q", got)
	}
	if got := grantedScope(mcpoauth.ScopeRead, "todos"); got != "" {
		t.Fatalf("unknown scope: %q", got)
	}
}

// mustCode takes the code out of a redirect Location.
func mustCode(t *testing.T, location string) string {
	t.Helper()
	u, err := url.Parse(location)
	if err != nil {
		t.Fatalf("location %q: %v", location, err)
	}
	code := u.Query().Get("code")
	if code == "" {
		t.Fatalf("no code in %q", location)
	}
	return code
}
