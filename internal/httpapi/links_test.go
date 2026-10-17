package httpapi

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/mail/smtptest"
)

// TestMailedLinksNeedBaseURL: without OPENTODO_BASE_URL no access-granting link
// is mailed (its host would come from the request), each flow answers 409
// base_url_required, and the owner sees a configuration warning
// (harden-links-and-sharing).
func TestMailedLinksNeedBaseURL(t *testing.T) {
	resetMinDuration = 0
	defer func() { resetMinDuration = 200 * time.Millisecond }()
	srv := smtptest.New(t, smtptest.Options{User: "todo", Pass: "hunter2"})
	e := newEnvWith(t, true, withTestMail(srv))
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)

	resp, out = e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	if ws := out["config_warnings"].([]any); len(ws) != 0 {
		t.Fatalf("warnings before SMTP = %v", ws)
	}
	e.configureMail(srv)
	resp, out = e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	ws := out["config_warnings"].([]any)
	if len(ws) != 1 || ws[0].(map[string]any)["variable"] != "OPENTODO_BASE_URL" {
		t.Fatalf("warnings = %v", ws)
	}

	_, secret, _ := e.invite(map[string]any{})
	member := newClientFor(e)
	resp, out = member.do("POST", "/api/v1/auth/register", map[string]string{"email": "m@example.com", "name": "M", "password": "another long password", "invitation": secret})
	member.mustStatus(resp, 201, out)
	memberID := out["user"].(map[string]any)["id"].(string)

	check := func(name string, code int, out map[string]any) {
		t.Helper()
		if code != 409 || errCode(out) != "base_url_required" {
			t.Fatalf("%s = %d %v", name, code, out)
		}
	}
	anon := newClientFor(e)
	resp, out = anon.do("POST", "/api/v1/auth/password-reset", map[string]string{"email": "m@example.com"})
	check("forgot password", resp.StatusCode, out)
	resp, out = e.do("POST", "/api/v1/users/"+memberID+"/password-reset", map[string]any{"send": true})
	check("admin reset by email", resp.StatusCode, out)
	resp, out = e.do("POST", "/api/v1/invitations", map[string]any{"email": "new@example.com", "send": true})
	check("invitation by email", resp.StatusCode, out)
	resp, out = newClientAt(e, "10.9.0.1").do("POST", "/api/v1/auth/register", map[string]string{"email": "open@example.com", "name": "O", "password": "yet another password"})
	check("verified sign-up", resp.StatusCode, out)
	if n := len(srv.Messages()); n != 0 {
		t.Fatalf("%d messages sent without a base URL", n)
	}

	// Links handed to the signed-in caller keep working without a base URL.
	resp, out = e.do("POST", "/api/v1/users/"+memberID+"/password-reset", nil)
	e.mustStatus(resp, 201, out)
	if link := out["link"].(string); !strings.HasPrefix(link, e.srv.URL+"/reset/") {
		t.Fatalf("copied reset link = %q", link)
	}
}

// TestMailedLinksIgnoreRequestHost: with a base URL the mailed link is built
// from it, whatever X-Forwarded-Host the anonymous caller sends, even through
// a trusted proxy.
func TestMailedLinksIgnoreRequestHost(t *testing.T) {
	resetMinDuration = 0
	defer func() { resetMinDuration = 200 * time.Millisecond }()
	t.Cleanup(func() { setTrustedProxies(nil, false) })
	setTrustedProxies([]netip.Prefix{netip.MustParsePrefix("127.0.0.1/32")}, false)
	e, srv := mailEnv(t, false)
	e.configureMail(srv)
	resp, out := newClientFor(e).do("POST", "/api/v1/auth/password-reset", map[string]string{"email": "owner@example.com"},
		"X-Forwarded-Host", "evil.example", "X-Forwarded-Proto", "https")
	if resp.StatusCode != 202 {
		t.Fatalf("reset = %d %v", resp.StatusCode, out)
	}
	msgs := srv.Messages()
	if len(msgs) != 1 {
		t.Fatalf("messages = %d", len(msgs))
	}
	if link := mailLink(t, msgs[0]); !strings.HasPrefix(link, testBaseURL+"/reset/") {
		t.Fatalf("mailed link = %q", link)
	}
}

// TestForwardedHostOnlyFromTrustedProxy: publicOrigin and the origin check use
// X-Forwarded-Host/-Proto only when the connection comes from a trusted proxy.
func TestForwardedHostOnlyFromTrustedProxy(t *testing.T) {
	t.Cleanup(func() { setTrustedProxies(nil, false) })
	s := &Server{}
	req := func(peer string) *http.Request {
		r := httptest.NewRequest("POST", "http://opentodo.lan:8080/api/v1/x", nil)
		r.RemoteAddr = peer + ":5555"
		r.Header.Set("X-Forwarded-Host", "todo.example.com")
		r.Header.Set("X-Forwarded-Proto", "https")
		r.Header.Set("Origin", "https://todo.example.com")
		return r
	}
	setTrustedProxies(nil, false)
	if got := s.publicOrigin(req("203.0.113.9")); got != "http://opentodo.lan:8080" {
		t.Fatalf("untrusted (no proxies) = %q", got)
	}
	setTrustedProxies([]netip.Prefix{netip.MustParsePrefix("172.18.0.0/16")}, false)
	if got := s.publicOrigin(req("203.0.113.9")); got != "http://opentodo.lan:8080" {
		t.Fatalf("untrusted peer = %q", got)
	}
	if s.originAllowed(req("203.0.113.9")) {
		t.Fatal("origin from an untrusted forwarded host accepted")
	}
	if got := s.publicOrigin(req("172.18.0.4")); got != "https://todo.example.com" {
		t.Fatalf("trusted proxy = %q", got)
	}
	if !s.originAllowed(req("172.18.0.4")) {
		t.Fatal("origin from a trusted proxy refused")
	}
}
