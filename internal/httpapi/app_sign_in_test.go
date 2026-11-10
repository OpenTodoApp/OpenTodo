package httpapi

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/webauthn"
	"github.com/OpenTodoApp/opentodo/internal/webauthn/testauth"
)

// App sign-in (native-app-foundation D5, the account-access spec delta).

// appQuery is the sign-in request the app opens, and the verifier it keeps.
func appQuery(t *testing.T, state, device string) (string, string) {
	t.Helper()
	verifier, challenge := pkcePair(t)
	return url.Values{
		"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "state": {state}, "device": {device},
	}.Encode(), verifier
}

// appConfirm opens /app/sign-in as the signed-in browser e and answers the
// confirmation, returning the address the sheet is sent to.
func (e *env) appConfirm(query string, allow bool) *url.URL {
	e.t.Helper()
	restore := e.noRedirect()
	resp, err := e.client.Get(e.srv.URL + appSignInPath + "?" + query)
	restore()
	if err != nil {
		e.t.Fatal(err)
	}
	resp.Body.Close()
	location := resp.Header.Get("Location")
	if resp.StatusCode != 302 || !strings.HasPrefix(location, "/?oauth_consent=") {
		e.t.Fatalf("sign-in page: %d %s", resp.StatusCode, location)
	}
	here, _ := url.Parse(location)
	consent := here.Query().Get("oauth_consent")
	if !strings.HasPrefix(consent, "client_id=opentodo-app&") {
		e.t.Fatalf("consent request = %s", consent)
	}
	r, out := e.do("POST", appConsentPath, map[string]any{"query": consent, "allow": allow})
	e.mustStatus(r, 200, out)
	back, err := url.Parse(out["redirect"].(string))
	if err != nil || back.Scheme != "opentodo" || back.Host != "signed-in" {
		e.t.Fatalf("redirect = %v", out["redirect"])
	}
	return back
}

// appToken posts to the token route from the app (no cookie) and returns the
// status and body.
func (e *env) appToken(body map[string]any) (int, map[string]any) {
	e.t.Helper()
	resp, out := e.bearerClient().do("POST", appTokenPath, body)
	return resp.StatusCode, out
}

// appSignIn runs the whole flow and returns the access and refresh tokens.
func (e *env) appSignIn(device string) (string, string) {
	e.t.Helper()
	query, verifier := appQuery(e.t, "st-"+device, device)
	back := e.appConfirm(query, true)
	status, out := e.appToken(map[string]any{"grant_type": "authorization_code", "code": back.Query().Get("code"), "code_verifier": verifier, "state": "st-" + device})
	if status != 200 {
		e.t.Fatalf("exchange: %d %v", status, out)
	}
	return out["access_token"].(string), out["refresh_token"].(string)
}

func (e *env) appRefresh(refresh string) (int, map[string]any) {
	e.t.Helper()
	return e.appToken(map[string]any{"grant_type": "refresh_token", "refresh_token": refresh})
}

// asApp sends a request with the app's access token.
func (e *env) asApp(access, method, path string, body any) (int, map[string]any) {
	e.t.Helper()
	resp, out := e.bearerClient().do(method, path, body, bearer(access)...)
	return resp.StatusCode, out
}

// Signed in on the web already: the confirmation is the only step, and the app
// then holds an `app` token that works like a full one. None of it needs the
// owner's MCP switch.
func TestAppSignInSignedInAlready(t *testing.T) {
	e := ownerEnv(t)
	query, verifier := appQuery(t, "s1", "iPhone")
	back := e.appConfirm(query, true)
	if back.Query().Get("state") != "s1" || back.Query().Get("code") == "" {
		t.Fatalf("redirect = %s", back)
	}
	status, out := e.appToken(map[string]any{"grant_type": "authorization_code", "code": back.Query().Get("code"), "code_verifier": verifier, "state": "s1"})
	if status != 200 || out["token_type"] != "Bearer" || out["scope"] != "app" || out["expires_in"] != float64(3600) || out["refresh_token"] == "" {
		t.Fatalf("exchange: %d %v", status, out)
	}
	access := out["access_token"].(string)
	status, me := e.asApp(access, "GET", "/api/v1/me", nil)
	if status != 200 {
		t.Fatalf("me: %d %v", status, me)
	}
	if cred, _ := me["auth"].(map[string]any); cred["scope"] != "app" {
		t.Fatalf("auth = %v", me["auth"])
	}
	if status, out := e.asApp(access, "POST", "/api/v1/tasks", map[string]any{"title": "From the app"}); status != 201 {
		t.Fatalf("write with an app token: %d %v", status, out)
	}
	// The app's access token is not an API token in Settings.
	resp, list := e.do("GET", "/api/v1/tokens", nil)
	e.mustStatus(resp, 200, list)
	if tokens, _ := list["tokens"].([]any); len(tokens) != 0 {
		t.Fatalf("the app's token is listed with the API tokens: %v", tokens)
	}
	if got := e.events(audit.MCPOAuthGrantedName); len(got) != 1 || got[0].Details["oauth_client_id"] != "opentodo-app" {
		t.Fatalf("granted events: %+v", got)
	}
}

// Not signed in at the confirmation: the server's sign-in page comes first and
// returns to the confirmation afterwards.
func TestAppSignInWithoutSession(t *testing.T) {
	e := ownerEnv(t)
	anon := newClientFor(e)
	query, _ := appQuery(t, "s", "iPhone")
	restore := anon.noRedirect()
	defer restore()
	resp, err := anon.client.Get(e.srv.URL + appSignInPath + "?" + query)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	loc, _ := url.Parse(resp.Header.Get("Location"))
	if resp.StatusCode != 302 || loc.Path != "/" {
		t.Fatalf("no session: %d %s", resp.StatusCode, loc)
	}
	next, _ := url.Parse(loc.Query().Get("oauth"))
	if next.Path != appSignInPath || next.RawQuery != query {
		t.Fatalf("return address = %s", next)
	}
	// A token is not a browser session: it cannot reach the confirmation.
	secret := e.token("full")
	r, out := e.bearerClient().do("GET", appSignInPath+"?"+query, nil, bearer(secret)...)
	if r.StatusCode != 403 || errCode(out) != "session_required" {
		t.Fatalf("token at the sign-in page: %d %v", r.StatusCode, out)
	}
	if r, out := e.bearerClient().do("POST", appConsentPath, map[string]any{"query": query, "allow": true}, bearer(secret)...); r.StatusCode != 403 {
		t.Fatalf("token at the confirmation: %d %v", r.StatusCode, out)
	}
}

// Sign-in with a passkey: the ceremony runs as on the web, and the app gets
// its code after the confirmation.
func TestAppSignInWithPasskey(t *testing.T) {
	e := newEnvWithBase(t, testBase, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	phone := testauth.New(t, webauthn.AlgES256)
	resp, out = e.registerPasskey(phone, "Phone")
	e.mustStatus(resp, 201, out)
	sheet := newClientFor(e)
	resp, out = sheet.loginWithPasskey(phone)
	sheet.mustStatus(resp, 200, out)
	query, verifier := appQuery(t, "pk", "iPhone")
	back := sheet.appConfirm(query, true)
	if status, out := sheet.appToken(map[string]any{"grant_type": "authorization_code", "code": back.Query().Get("code"), "code_verifier": verifier, "state": "pk"}); status != 200 {
		t.Fatalf("exchange after a passkey sign-in: %d %v", status, out)
	}
}

// Cancel answers access_denied with the state, and no code.
func TestAppSignInCancel(t *testing.T) {
	e := ownerEnv(t)
	query, _ := appQuery(t, "s", "iPhone")
	back := e.appConfirm(query, false)
	if back.Query().Get("error") != "access_denied" || back.Query().Get("state") != "s" || back.Query().Get("code") != "" {
		t.Fatalf("cancel = %s", back)
	}
}

// The sign-in page and the confirmation refuse a request without an S256
// challenge or a state.
func TestAppSignInRequestChecks(t *testing.T) {
	e := ownerEnv(t)
	_, challenge := pkcePair(t)
	for name, q := range map[string]url.Values{
		"no challenge": {"code_challenge_method": {"S256"}, "state": {"s"}},
		"plain method": {"code_challenge": {challenge}, "code_challenge_method": {"plain"}, "state": {"s"}},
		"bad shape":    {"code_challenge": {"short"}, "code_challenge_method": {"S256"}, "state": {"s"}},
		"no state":     {"code_challenge": {challenge}, "code_challenge_method": {"S256"}},
		"long state":   {"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "state": {strings.Repeat("s", 513)}},
	} {
		resp, out := e.do("GET", appSignInPath+"?"+q.Encode(), nil)
		if resp.StatusCode != 400 || errCode(out) != "invalid_request" {
			t.Errorf("%s: page %d %v", name, resp.StatusCode, out)
		}
		resp, out = e.do("POST", appConsentPath, map[string]any{"query": q.Encode(), "allow": true})
		if resp.StatusCode != 400 || errCode(out) != "invalid_request" {
			t.Errorf("%s: confirmation %d %v", name, resp.StatusCode, out)
		}
	}
}

// Every error row of the token route's table.
func TestAppTokenErrors(t *testing.T) {
	e := ownerEnv(t)
	code := func(state string) (string, string) {
		query, verifier := appQuery(t, state, "iPhone")
		return e.appConfirm(query, true).Query().Get("code"), verifier
	}
	expect := func(name string, status int, out map[string]any, wantStatus int, want string) {
		t.Helper()
		if status != wantStatus || errCode(out) != want {
			t.Errorf("%s: %d %v, want %d %s", name, status, out, wantStatus, want)
		}
	}
	// invalid_request: a required field missing or malformed.
	for name, body := range map[string]map[string]any{
		"no grant_type":      {"code": "x"},
		"unknown grant_type": {"grant_type": "password"},
		"no code":            {"grant_type": "authorization_code", "code_verifier": "v", "state": "s"},
		"no refresh_token":   {"grant_type": "refresh_token"},
		"unknown field":      {"grant_type": "refresh_token", "refresh_token": "x", "client_secret": "y"},
		"not an object":      nil,
	} {
		status, out := e.appToken(body)
		expect(name, status, out, 400, "invalid_request")
	}
	// invalid_grant: the code unknown, used, expired or not matching.
	status, out := e.appToken(map[string]any{"grant_type": "authorization_code", "code": "unknown", "code_verifier": "v", "state": "s"})
	expect("unknown code", status, out, 400, "invalid_grant")
	c, v := code("s")
	status, out = e.appToken(map[string]any{"grant_type": "authorization_code", "code": c, "code_verifier": v, "state": "other"})
	expect("wrong state", status, out, 400, "invalid_grant")
	c, v = code("s")
	if status, out := e.appToken(map[string]any{"grant_type": "authorization_code", "code": c, "code_verifier": v, "state": "s"}); status != 200 {
		t.Fatalf("exchange: %d %v", status, out)
	}
	status, out = e.appToken(map[string]any{"grant_type": "authorization_code", "code": c, "code_verifier": v, "state": "s"})
	expect("used code", status, out, 400, "invalid_grant")
	c, v = code("s")
	e.now.Freeze(time.Now().Add(61 * time.Second))
	status, out = e.appToken(map[string]any{"grant_type": "authorization_code", "code": c, "code_verifier": v, "state": "s"})
	expect("expired code", status, out, 400, "invalid_grant")
	// invalid_grant: the refresh token unknown or revoked.
	status, out = e.appRefresh("unknown")
	expect("unknown refresh token", status, out, 400, "invalid_grant")
}

// An intercepted code presented without the verifier gets nothing, and the
// app can no longer use it either.
func TestAppSignInInterceptedCode(t *testing.T) {
	e := ownerEnv(t)
	query, verifier := appQuery(t, "s", "iPhone")
	c := e.appConfirm(query, true).Query().Get("code")
	status, out := e.appToken(map[string]any{"grant_type": "authorization_code", "code": c, "state": "s"})
	if status != 400 || errCode(out) != "invalid_grant" || out["access_token"] != nil {
		t.Fatalf("without the verifier: %d %v", status, out)
	}
	status, out = e.appToken(map[string]any{"grant_type": "authorization_code", "code": c, "code_verifier": verifier, "state": "s"})
	if status != 400 || errCode(out) != "invalid_grant" {
		t.Fatalf("the code survived the interception: %d %v", status, out)
	}
}

// The refresh token rotates; one presented again revokes the grant, so every
// token of it stops working, and the event is audited.
func TestAppRefreshRotationAndReuse(t *testing.T) {
	e := ownerEnv(t)
	access, first := e.appSignIn("iPhone")
	status, out := e.appRefresh(first)
	if status != 200 || out["refresh_token"] == first || out["access_token"] == access {
		t.Fatalf("refresh: %d %v", status, out)
	}
	second, access2 := out["refresh_token"].(string), out["access_token"].(string)
	if status, _ := e.asApp(access, "GET", "/api/v1/me", nil); status != 401 {
		t.Fatalf("the replaced access token answered %d", status)
	}
	if status, _ := e.asApp(access2, "GET", "/api/v1/me", nil); status != 200 {
		t.Fatalf("the new access token answered %d", status)
	}
	status, out = e.appRefresh(first)
	if status != 400 || errCode(out) != "invalid_grant" {
		t.Fatalf("reused refresh token: %d %v", status, out)
	}
	if status, _ := e.asApp(access2, "GET", "/api/v1/me", nil); status != 401 {
		t.Fatalf("an access token of a revoked grant answered %d", status)
	}
	if status, out := e.appRefresh(second); status != 400 || errCode(out) != "invalid_grant" {
		t.Fatalf("the newest refresh token of a revoked grant: %d %v", status, out)
	}
	if got := e.events(audit.MCPOAuthRefreshReusedName); len(got) != 1 || got[0].Details["oauth_client_id"] != "opentodo-app" {
		t.Fatalf("refresh_reused events: %+v", got)
	}
}

// The token route is rate limited per address.
func TestAppTokenRateLimited(t *testing.T) {
	e := ownerEnv(t)
	c := newClientAt(e, "198.51.100.77")
	for i := 0; i < appTokensPerMinute; i++ {
		if resp, out := c.do("POST", appTokenPath, map[string]any{"grant_type": "refresh_token", "refresh_token": "x"}); resp.StatusCode != 400 {
			t.Fatalf("attempt %d: %d %v", i, resp.StatusCode, out)
		}
	}
	resp, out := c.do("POST", appTokenPath, map[string]any{"grant_type": "refresh_token", "refresh_token": "x"})
	if resp.StatusCode != 429 || errCode(out) != "rate_limited" {
		t.Fatalf("over the limit: %d %v", resp.StatusCode, out)
	}
	if resp, _ := newClientAt(e, "198.51.100.78").do("POST", appTokenPath, map[string]any{"grant_type": "refresh_token", "refresh_token": "x"}); resp.StatusCode != 400 {
		t.Fatalf("another address: %d", resp.StatusCode)
	}
}

// A demo instance refuses app sign-in.
func TestAppSignInDemoDenied(t *testing.T) {
	d := newDemoServer(t)
	v, _ := d.visitor()
	for _, req := range []struct{ method, path string }{
		{"POST", appTokenPath}, {"GET", appSignInPath}, {"POST", appConsentPath}, {"POST", appSignOutPath},
	} {
		resp, out := v.do(req.method, req.path, map[string]any{"grant_type": "refresh_token", "refresh_token": "x"})
		if resp.StatusCode != 403 || errCode(out) != "demo_restricted" {
			t.Errorf("%s %s on a demo: %d %v", req.method, req.path, resp.StatusCode, out)
		}
	}
}

// The MCP endpoints never accept the app's built-in client.
func TestAppClientIsNotAnMCPClient(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	_, challenge := pkcePair(t)
	resp, out := e.do("GET", mcpConsentPath+"?"+url.Values{
		"response_type": {"code"}, "client_id": {"opentodo-app"}, "redirect_uri": {"opentodo://signed-in"},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"},
	}.Encode(), nil)
	if resp.StatusCode != 400 || out["error"] != "invalid_client" {
		t.Fatalf("MCP consent for the app's client: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("GET", mcpClientsPath, nil)
	e.mustStatus(resp, 200, out)
	if clients, _ := out["clients"].([]any); len(clients) != 0 {
		t.Fatalf("MCP clients = %v", clients)
	}
	status, body := e.oauthForm(mcpTokenPath, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {"x"}, "client_id": {"opentodo-app"}})
	if status != 401 || body["error"] != "invalid_client" {
		t.Fatalf("MCP token endpoint for the app's client: %d %v", status, body)
	}
}

// The health check tells the app this server has app sign-in (D11).
func TestHealthAnnouncesAppSignIn(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("GET", "/api/v1/health", nil)
	e.mustStatus(resp, 200, out)
	if out["app_sign_in"] != true {
		t.Fatalf("health = %v", out)
	}
}

// requireStatus fails unless resp has the status.
func requireStatus(t *testing.T, name string, resp *http.Response, want int, out map[string]any) {
	t.Helper()
	if resp.StatusCode != want {
		t.Fatalf("%s: %d %v, want %d", name, resp.StatusCode, out, want)
	}
}
