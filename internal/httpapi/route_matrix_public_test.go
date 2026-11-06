package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/httpapi/httpx"
)

// Public routes in the route matrix (external-security-review 6.10). A public
// route has no policy layer: its handler decides on its own credential, and
// its reason says what it promises. Each public route is classified below by
// that promise; the matrix calls it anonymously, as the owner's session, as a
// member's session, with each token scope and cross-site, and checks the
// answers against the class. A public route without a class fails the test,
// so a new one has to say what it promises before it ships.

// publicClass is what a public route's reason promises.
type publicClass uint8

const (
	// pubStatic: the answer does not depend on who asks. It holds no account
	// data, so a session, a token or another site gets what anyone gets.
	pubStatic publicClass = iota + 1
	// pubSecret: the secret in the address is the credential. A session or an
	// API token never stands in for it: with a wrong secret every caller is
	// refused alike.
	pubSecret
	// pubSignIn: a step before there is a session (sign-in, sign-up, password
	// reset, the demo sandbox). A write from another site is refused, and a
	// session or token changes nothing.
	pubSignIn
	// pubSessionWrite: acts on the session cookie without requiring one
	// (signing out). Another site cannot make it act, and a token changes
	// nothing.
	pubSessionWrite
	// pubHandlerAuth: the handler authenticates its own credential (an app
	// password, an OAuth client secret, a bearer token for MCP). The session
	// cookie never authenticates, and an API token only where it is the
	// credential (tokenCredential).
	pubHandlerAuth
	// pubBrowserStep: a browser step that reads the session (OAuth authorize,
	// single sign-on). An API token never stands in for the session.
	pubBrowserStep
	// pubOwnAccount: the sign-in screen's bootstrap. Anonymous callers learn
	// about no account; a signed-in caller sees only their own.
	pubOwnAccount
)

// publicRouteClasses classifies every public route by pattern. A route only
// registered in some configurations (the web app, the demo) is classified too.
var publicRouteClasses = map[string]publicClass{
	"GET /healthz":                    pubStatic,
	"GET /.well-known/security.txt":   pubStatic,
	"/api/":                           pubStatic,
	"/":                               pubStatic,
	"POST /share":                     pubStatic,
	"GET /public/":                    pubStatic,
	"GET /t/":                         pubStatic,
	"GET /branding/{file}":            pubStatic,
	"GET " + mcpProtectedResourcePath: pubStatic,
	"GET " + mcpProtectedResourcePath + "/mcp":    pubStatic,
	"GET /.well-known/oauth-authorization-server": pubStatic,
	"PROPFIND /{$}":           pubStatic,
	"OPTIONS /{$}":            pubStatic,
	"/principals":             pubStatic,
	"/principals/":            pubStatic,
	"GET /api/v1/auth/status": pubOwnAccount,

	"GET /api/v1/invitations/{token}":                           pubSecret,
	"GET /api/v1/public/{token}":                                pubSecret,
	"POST /api/v1/public/{token}/tick":                          pubSecret,
	"GET /api/v1/workspace-invites/{token}":                     pubSecret,
	"GET /api/v1/project-invites/{token}":                       pubSecret,
	"GET /api/v1/auth/verify/{token}":                           pubSecret,
	"POST /api/v1/auth/verify/{token}":                          pubSecret,
	"GET /api/v1/password-resets/{token}":                       pubSecret,
	"POST /api/v1/password-resets/{token}":                      pubSecret,
	"GET /feeds/{secret}/tasks.ics":                             pubSecret,
	"GET /api/v1/pages/{secret}":                                pubSecret,
	"POST /api/v1/pages/{secret}/replies":                       pubSecret,
	"POST /api/v1/pages/{secret}/tick":                          pubSecret,
	"GET /api/v1/pages/{secret}/files/{fileId}":                 pubSecret,
	"GET /api/v1/pages/{secret}/maps/style":                     pubSecret,
	"GET /api/v1/pages/{secret}/maps/tiles/{z}/{x}/{y}":         pubSecret,
	"GET /api/v1/pages/{secret}/maps/fonts/{fontstack}/{range}": pubSecret,
	"GET /api/v1/pages/{secret}/maps/sprites/{file}":            pubSecret,

	"POST /api/v1/auth/register":        pubSignIn,
	"POST /api/v1/auth/login":           pubSignIn,
	"POST /api/v1/auth/passkey/options": pubSignIn,
	"POST /api/v1/auth/passkey":         pubSignIn,
	"POST /api/v1/auth/mfa":             pubSignIn,
	"POST /api/v1/auth/password-reset":  pubSignIn,
	"POST /api/v1/demo/sandbox":         pubSignIn,
	"POST /api/v1/auth/logout":          pubSessionWrite,

	"/mcp":                    pubHandlerAuth,
	"POST " + mcpRegisterPath: pubHandlerAuth,
	"POST " + mcpTokenPath:    pubHandlerAuth,
	"POST " + mcpRevokePath:   pubHandlerAuth,
	"/dav/":                   pubHandlerAuth,
	"/dav":                    pubHandlerAuth,
	"/.well-known/caldav":     pubHandlerAuth,
	"/.well-known/caldav/":    pubHandlerAuth,

	"GET " + mcpAuthorizePath:     pubBrowserStep,
	"GET /api/v1/auth/oidc/start": pubBrowserStep,
	"GET " + oidcCallbackPath:     pubBrowserStep,
}

// tokenCredential are the handler-authenticated routes whose credential is an
// API token (the MCP endpoint).
var tokenCredential = map[string]bool{"/mcp": true}

// answer is what the public pass compares: the status, the error code, the
// redirect target and, for JSON, the decoded body.
type answer struct {
	status         int
	code, location string
	body           map[string]any
}

func (a answer) String() string {
	return fmt.Sprintf("%d %q %s", a.status, a.code, a.location)
}

// same compares two answers on what does not vary between calls.
func (a answer) same(b answer) bool {
	return a.status == b.status && a.code == b.code && a.location == b.location
}

// publicIP gives each public call its own client address, so rate limits
// keyed by address never make one caller's answer differ from another's.
var publicIP atomic.Int64

// callAs sends one request from c (its cookies) with its own address.
func (m *matrixEnv) callAs(c *env, method, path string, headers ...string) answer {
	m.t.Helper()
	var body io.Reader
	if method != "GET" && method != "HEAD" {
		body = bytes.NewReader([]byte("{}"))
	}
	req, _ := http.NewRequest(method, m.srv0()+path, body)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	n := publicIP.Add(1)
	req.Header.Set("X-Forwarded-For", fmt.Sprintf("198.18.%d.%d", n/250, n%250+1))
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	client := &http.Client{Jar: c.client.Jar, Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		var ne net.Error
		if errors.As(err, &ne) && ne.Timeout() {
			return answer{status: 200}
		}
		m.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	a := answer{status: resp.StatusCode, location: resp.Header.Get("Location")}
	if strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json") {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		_ = json.Unmarshal(raw, &a.body)
		a.code = errCode(a.body)
	}
	return a
}

const evilOrigin = "https://evil.example"

// publicPass checks every public route of the matrix server against its class,
// and that every public route of every configuration has one.
func (m *matrixEnv) publicPass(t *testing.T, routes []matrixRoute, checked map[string]int) {
	t.Helper()
	all := append(routeTableOf(t, true), routeTableOf(t, false)...)
	all = append(all, m.srv.routeTable...)
	reported := map[string]bool{}
	for _, e := range all {
		if e.policy.Kind == httpx.KindPublic && publicRouteClasses[e.pattern] == 0 && !reported[e.pattern] {
			reported[e.pattern] = true
			t.Errorf("public route %s (%q) has no class in publicRouteClasses: say what its reason promises", e.pattern, e.policy.Reason)
		}
	}
	bearer := func(tok string) []string { return []string{"Authorization", "Bearer " + tok} }
	tokens := []struct{ scope, secret string }{{"read", m.read}, {"agent", m.agent}, {"full", m.full}, {"admin", m.admin}}
	for _, r := range routes {
		class := publicRouteClasses[r.pattern]
		if r.p.Kind != httpx.KindPublic || class == 0 {
			continue
		}
		where := fmt.Sprintf("%s %s (%s, %q)", r.method, r.path, r.pattern, r.p.Reason)
		anon := m.callAs(m.anon, r.method, r.path)
		got := map[string]answer{}
		if class != pubSessionWrite {
			// Signing out with the matrix's own sessions would end them;
			// publicEffects signs out sessions of its own.
			got["owner session"] = m.callAs(m.env, r.method, r.path)
			got["member session"] = m.callAs(m.member, r.method, r.path)
		}
		for _, tok := range tokens {
			got[tok.scope+" token"] = m.callAs(m.anon, r.method, r.path, bearer(tok.secret)...)
		}
		cross := map[string]answer{
			"anonymous cross-site":  m.callAs(m.anon, r.method, r.path, "Origin", evilOrigin),
			"owner cross-site":      m.callAs(m.env, r.method, r.path, "Origin", evilOrigin),
			"full token cross-site": m.callAs(m.anon, r.method, r.path, "Origin", evilOrigin, "Authorization", "Bearer "+m.full),
		}
		for who, a := range mergeAnswers(got, cross, map[string]answer{"anonymous": anon}) {
			if a.status >= 500 {
				t.Errorf("%s as %s = %s, a server error", where, who, a)
			}
		}
		// Whose answer must equal the anonymous one.
		mustMatch := func(who string) {
			t.Helper()
			if a := got[who]; !a.same(anon) {
				t.Errorf("%s as %s = %s, want what anyone gets (%s)", where, who, a, anon)
			}
		}
		tokensMatch := func() {
			t.Helper()
			for _, tok := range tokens {
				mustMatch(tok.scope + " token")
			}
		}
		crossRefused := func() {
			t.Helper()
			for who, a := range cross {
				// A feature that is off (outgoing email) answers 404 to
				// everyone before it reads anything.
				off := anon.status == http.StatusNotFound && a.same(anon)
				if !off && (a.status != http.StatusForbidden || a.code != "bad_origin") {
					t.Errorf("%s as %s = %s, want 403 \"bad_origin\"", where, who, a)
				}
			}
		}
		switch class {
		case pubStatic:
			mustMatch("owner session")
			mustMatch("member session")
			tokensMatch()
			for who, a := range cross {
				if !a.same(anon) {
					t.Errorf("%s as %s = %s, want what anyone gets (%s)", where, who, a, anon)
				}
			}
		case pubSecret:
			if anon.status < 400 || anon.status >= 500 {
				t.Errorf("%s with a wrong secret = %s, want a refusal", where, anon)
			}
			mustMatch("owner session")
			mustMatch("member session")
			tokensMatch()
		case pubSignIn, pubSessionWrite:
			if class == pubSignIn {
				mustMatch("owner session")
				mustMatch("member session")
			}
			tokensMatch()
			if r.write() {
				crossRefused()
			}
		case pubHandlerAuth:
			mustMatch("owner session")
			mustMatch("member session")
			if !tokenCredential[r.pattern] {
				tokensMatch()
			} else if a := cross["full token cross-site"]; a.status < 400 && r.method == "POST" {
				t.Errorf("%s with a token from another site = %s, want a refusal", where, a)
			}
		case pubBrowserStep:
			tokensMatch()
		case pubOwnAccount:
			m.checkOwnAccount(t, where, anon, got)
		}
		checked["public routes"]++
	}
}

func mergeAnswers(maps ...map[string]answer) map[string]answer {
	out := map[string]answer{}
	for _, mp := range maps {
		for k, v := range mp {
			out[k] = v
		}
	}
	return out
}

// checkOwnAccount: the bootstrap names no account to an anonymous caller, and
// each signed-in caller only their own.
func (m *matrixEnv) checkOwnAccount(t *testing.T, where string, anon answer, got map[string]answer) {
	t.Helper()
	email := func(a answer) string {
		u, _ := a.body["user"].(map[string]any)
		s, _ := u["email"].(string)
		return s
	}
	if anon.body["authenticated"] != false || anon.body["user"] != nil {
		t.Errorf("%s anonymously names an account: %v", where, anon.body)
	}
	want := map[string]string{"owner session": "owner@example.com", "member session": "member@example.com"}
	for _, scope := range []string{"read", "agent", "full", "admin"} {
		want[scope+" token"] = "owner@example.com"
	}
	for who, w := range want {
		if e := email(got[who]); e != w {
			t.Errorf("%s as %s names %q, want %q", where, who, e, w)
		}
	}
}

// publicEffects checks what the classes promise beyond the answer: a public
// list link shows the same list, and only that list, to every caller; a
// cross-site sign-out leaves the session signed in.
func (m *matrixEnv) publicEffects(t *testing.T, checked map[string]int) {
	t.Helper()
	resp, out := m.env.do("POST", "/api/v1/projects", map[string]any{"name": "Private"})
	m.env.mustStatus(resp, 201, out)
	resp, out = m.env.do("POST", "/api/v1/tasks", map[string]any{"title": "Private task", "project_id": out["id"]})
	m.env.mustStatus(resp, 201, out)
	secret, _ := publicLink(t, m.env, m.sharedProject, map[string]any{"rights": "view"})
	path := "/api/v1/public/" + secret
	list := func(a answer) string {
		delete(a.body, "serverTime")
		b, _ := json.Marshal(a.body)
		return string(b)
	}
	anon := m.callAs(m.anon, "GET", path)
	if anon.status != 200 || !strings.Contains(list(anon), "Shared task") || strings.Contains(list(anon), "Private task") {
		t.Errorf("public list anonymously = %s %s, want the shared project only", anon, list(anon))
	}
	for who, a := range map[string]answer{
		"owner session":  m.callAs(m.env, "GET", path),
		"member session": m.callAs(m.member, "GET", path),
		"read token":     m.callAs(m.anon, "GET", path, "Authorization", "Bearer "+m.read),
		"admin token":    m.callAs(m.anon, "GET", path, "Authorization", "Bearer "+m.admin),
		"cross-site":     m.callAs(m.anon, "GET", path, "Origin", evilOrigin),
	} {
		if list(a) != list(anon) {
			t.Errorf("public list as %s = %s, want what anyone gets", who, list(a))
		}
		checked["public effects"]++
	}

	// A second owner session, signed out from another site and from a
	// browser that says the request is cross-site.
	victim := newClientAt(m.env, "203.0.113.43")
	resp, out = victim.do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "correct horse battery"})
	victim.mustStatus(resp, 200, out)
	for _, h := range [][]string{{"Origin", evilOrigin}, {noFetchMetadata, "1", "Sec-Fetch-Site", "cross-site"}, {noFetchMetadata, "1", "Sec-Fetch-Site", "same-site"}} {
		if a := m.callAs(victim, "POST", "/api/v1/auth/logout", h...); a.status != http.StatusForbidden || a.code != "bad_origin" {
			t.Errorf("sign-out with %v = %s, want 403 \"bad_origin\"", h, a)
		}
		resp, out = victim.do("GET", "/api/v1/me", nil)
		if resp.StatusCode != 200 {
			t.Fatalf("session after a cross-site sign-out with %v = %d %v, want it still signed in", h, resp.StatusCode, out)
		}
		checked["public effects"]++
	}
	// The app's own pages and non-browser clients still sign out.
	if a := m.callAs(victim, "POST", "/api/v1/auth/logout", noFetchMetadata, "1"); a.status != http.StatusNoContent {
		t.Errorf("sign-out without Origin or Sec-Fetch-Site = %s, want 204", a)
	}
	if resp, _ := victim.do("GET", "/api/v1/me", nil); resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("session after signing out = %d, want 401", resp.StatusCode)
	}
}
