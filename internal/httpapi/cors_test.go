package httpapi

import (
	"net/http"
	"net/url"
	"testing"
)

const corsDash = "https://dash.example.com"

// corsEnv is a server with an owner whose OPENTODO_CORS_ORIGINS lists corsDash.
func corsEnv(t *testing.T, origins ...string) *env {
	t.Helper()
	e := newEnvWith(t, false, func(s *Server) { s.cfg.CORSOrigins = origins })
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e
}

func preflight(e *env, path, origin string) *http.Response {
	e.t.Helper()
	req, _ := http.NewRequest(http.MethodOptions, e.srv.URL+path, nil)
	req.Header.Set("Origin", origin)
	req.Header.Set("Access-Control-Request-Method", "PATCH")
	req.Header.Set("Access-Control-Request-Headers", "authorization, content-type")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	resp.Body.Close()
	return resp
}

func noCORS(t *testing.T, what string, resp *http.Response) {
	t.Helper()
	for _, h := range []string{"Access-Control-Allow-Origin", "Access-Control-Allow-Methods", "Access-Control-Allow-Headers", "Access-Control-Allow-Credentials", "Access-Control-Expose-Headers"} {
		if v := resp.Header.Get(h); v != "" {
			t.Fatalf("%s: %s = %q, want none", what, h, v)
		}
	}
}

// cors-for-tokens "Off by default": no CORS headers, a preflight answers as
// before (405 from the unknown-method route).
func TestCORSOffByDefault(t *testing.T) {
	e := ownerEnv(t)
	secret := e.token("read")
	resp := preflight(e, "/api/v1/tasks", corsDash)
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("preflight = %d, want 405", resp.StatusCode)
	}
	noCORS(t, "preflight", resp)
	resp, out := e.bearerClient().do("GET", "/api/v1/tasks", nil, append(bearer(secret), "Origin", corsDash)...)
	e.mustStatus(resp, 200, out)
	noCORS(t, "bearer GET", resp)
	if v := resp.Header.Get("Vary"); v != "" {
		t.Fatalf("Vary = %q without CORS", v)
	}
}

// cors-for-tokens: a listed origin's preflight and token requests.
func TestCORSListedOriginWithToken(t *testing.T) {
	e := corsEnv(t, corsDash)
	resp := preflight(e, "/api/v1/tasks/abc", corsDash)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("preflight = %d, want 204", resp.StatusCode)
	}
	for h, want := range map[string]string{
		"Access-Control-Allow-Origin":  corsDash,
		"Access-Control-Allow-Methods": corsMethods,
		"Access-Control-Allow-Headers": corsHeaders,
		"Access-Control-Max-Age":       corsMaxAge,
		"Vary":                         "Origin",
	} {
		if got := resp.Header.Get(h); got != want {
			t.Fatalf("preflight %s = %q, want %q", h, got, want)
		}
	}
	if v := resp.Header.Get("Access-Control-Allow-Credentials"); v != "" {
		t.Fatalf("Access-Control-Allow-Credentials = %q", v)
	}

	read, full := e.token("read"), e.token("")
	c := e.bearerClient()
	resp, out := c.do("GET", "/api/v1/tasks", nil, append(bearer(read), "Origin", corsDash)...)
	e.mustStatus(resp, 200, out)
	if resp.Header.Get("Access-Control-Allow-Origin") != corsDash || resp.Header.Get("Vary") != "Origin" || resp.Header.Get("Access-Control-Expose-Headers") != corsExpose {
		t.Fatalf("bearer GET headers = %v", resp.Header)
	}
	if v := resp.Header.Get("Access-Control-Allow-Credentials"); v != "" {
		t.Fatalf("Access-Control-Allow-Credentials = %q", v)
	}
	// The token's scope still decides: a read token's write is refused, and
	// the page can read why.
	resp, out = c.do("POST", "/api/v1/tasks", map[string]any{"title": "x"}, append(bearer(read), "Origin", corsDash)...)
	if resp.StatusCode != http.StatusForbidden || errCode(out) != "insufficient_scope" || resp.Header.Get("Access-Control-Allow-Origin") != corsDash {
		t.Fatalf("read token write = %d %v %v", resp.StatusCode, out, resp.Header)
	}
	resp, out = c.do("POST", "/api/v1/tasks", map[string]any{"title": "from the dashboard"}, append(bearer(full), "Origin", corsDash)...)
	e.mustStatus(resp, 201, out)
	if resp.Header.Get("Access-Control-Allow-Origin") != corsDash {
		t.Fatalf("full token write ACAO = %q", resp.Header.Get("Access-Control-Allow-Origin"))
	}
}

// cors-for-tokens: an origin not listed gets nothing, and same-origin
// requests are unchanged apart from Vary.
func TestCORSUnlistedOrigin(t *testing.T) {
	e := corsEnv(t, corsDash)
	resp := preflight(e, "/api/v1/tasks", "https://evil.example")
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("preflight = %d, want 405", resp.StatusCode)
	}
	noCORS(t, "unlisted preflight", resp)
	secret := e.token("read")
	for _, o := range []string{"https://evil.example", "https://dash.example.com.evil.example", "http://dash.example.com", "null"} {
		resp, out := e.bearerClient().do("GET", "/api/v1/tasks", nil, append(bearer(secret), "Origin", o)...)
		e.mustStatus(resp, 200, out)
		noCORS(t, o, resp)
		if resp.Header.Get("Vary") != "Origin" {
			t.Fatalf("%s: Vary = %q", o, resp.Header.Get("Vary"))
		}
	}
}

// cors-for-tokens "Never with the session cookie": a listed origin's request
// that carries only the cookie gets no CORS headers, and its writes are still
// refused by the cross-site check.
func TestCORSCookieRequestsStaySameOrigin(t *testing.T) {
	e := corsEnv(t, corsDash)
	resp, out := e.do("GET", "/api/v1/tasks", nil, "Origin", corsDash)
	e.mustStatus(resp, 200, out)
	noCORS(t, "cookie GET", resp)
	// The app's own pages are unaffected.
	u, _ := url.Parse(e.srv.URL)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "fine"}, "Origin", "http://"+u.Host)
	e.mustStatus(resp, 201, out)
	noCORS(t, "same-origin write", resp)
	id, _ := out["id"].(string)
	for _, mp := range [][2]string{{"POST", "/api/v1/tasks"}, {"PATCH", "/api/v1/tasks/" + id}, {"DELETE", "/api/v1/tasks/" + id}, {"PUT", "/api/v1/me/assistant"}} {
		resp, out = e.do(mp[0], mp[1], map[string]any{"title": "x"}, "Origin", corsDash)
		if resp.StatusCode != http.StatusForbidden || errCode(out) != "bad_origin" {
			t.Fatalf("cookie %s %s from the listed origin = %d %v", mp[0], mp[1], resp.StatusCode, out)
		}
		noCORS(t, "cookie "+mp[0], resp)
	}
}

// cors-for-tokens "Only the data API": sign-in, the app exchange, CalDAV, MCP,
// OAuth and health stay as they are.
func TestCORSOtherRoutesUntouched(t *testing.T) {
	e := corsEnv(t, corsDash)
	for _, p := range []string{"/api/v1/auth/login", "/api/v1/auth/status", "/api/v1/app/token", "/api/v1/demo/sandbox", "/api/v1/auth/../auth/login", "/dav/", "/mcp", "/oauth/token", "/healthz", "/.well-known/oauth-protected-resource"} {
		resp := preflight(e, p, corsDash)
		if resp.StatusCode == http.StatusNoContent {
			t.Fatalf("%s: preflight answered 204", p)
		}
		noCORS(t, p+" preflight", resp)
	}
	resp, out := e.bearerClient().do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "correct horse battery"}, "Origin", corsDash, "Authorization", "Bearer ot_x")
	if resp.StatusCode == http.StatusOK {
		t.Fatalf("cross-origin sign-in = %d %v", resp.StatusCode, out)
	}
	noCORS(t, "sign-in", resp)
}

// The origin list matches the Origin header in any letter case and echoes it.
func TestCORSOriginCase(t *testing.T) {
	e := corsEnv(t, corsDash, "http://localhost:5173")
	resp := preflight(e, "/api/v1/projects", "http://localhost:5173")
	if resp.StatusCode != http.StatusNoContent || resp.Header.Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatalf("second origin preflight = %d %v", resp.StatusCode, resp.Header)
	}
	resp = preflight(e, "/api/v1/projects", "https://DASH.example.com")
	if resp.StatusCode != http.StatusNoContent || resp.Header.Get("Access-Control-Allow-Origin") != "https://DASH.example.com" {
		t.Fatalf("upper-case origin preflight = %d %v", resp.StatusCode, resp.Header)
	}
}
