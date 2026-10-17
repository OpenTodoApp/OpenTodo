package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/config"
)

// OpenSpec change trusted-client-identity: who the client is (X-Forwarded-For
// only from trusted peers), per-account failure limits, the setup code for a
// first registration from a public address, and Secure cookies / HSTS.

// TestForwardedForOnlyFromTrustedPeers: with OPENTODO_TRUSTED_PROXIES unset,
// X-Forwarded-For is honoured from loopback and private peers only; a public
// peer is the client whatever it claims.
func TestForwardedForOnlyFromTrustedPeers(t *testing.T) {
	t.Cleanup(func() { setTrustedProxies(nil, false) })
	setTrustedProxies(nil, false)
	ip := func(peer, xff string) string {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = peer
		if xff != "" {
			r.Header.Set("X-Forwarded-For", xff)
		}
		return clientIP(r)
	}
	cases := []struct{ name, peer, xff, want string }{
		{"public peer forges a hop", "198.51.100.20:4000", "6.6.6.6", "198.51.100.20"},
		{"public peer forges a private hop", "198.51.100.20:4000", "192.168.1.5", "198.51.100.20"},
		{"loopback proxy", "127.0.0.1:4000", "203.0.113.4", "203.0.113.4"},
		{"docker network proxy", "172.18.0.3:4000", "6.6.6.6, 203.0.113.4", "203.0.113.4"},
		{"ipv6 loopback proxy", "[::1]:4000", "2001:db8::7", "2001:db8::7"},
		{"lan client behind the proxy", "10.0.0.2:4000", "192.168.1.5", "192.168.1.5"},
		{"no header", "198.51.100.20:4000", "", "198.51.100.20"},
	}
	for _, c := range cases {
		if got := ip(c.peer, c.xff); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
	// A configured list replaces the default: a private peer not on it is the client.
	setTrustedProxies(config.ParseTrustedProxies("192.0.2.0/24").Prefixes, false)
	if got := ip("10.0.0.2:4000", "203.0.113.4"); got != "10.0.0.2" {
		t.Fatalf("unlisted private peer: %q", got)
	}
	if got := ip("192.0.2.9:4000", "203.0.113.4"); got != "203.0.113.4" {
		t.Fatalf("listed peer: %q", got)
	}
}

// TestLoginLimitCountsFailuresOnly: successful sign-ins never use up the
// address's window.
func TestLoginLimitCountsFailuresOnly(t *testing.T) {
	e := newEnv(t, false)
	registerOwner(e)
	c := newClientAt(e, "203.0.113.30")
	for i := 0; i < 15; i++ {
		resp, out := login(c, "owner@example.com", "correct horse battery")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("sign-in %d = %d %v", i+1, resp.StatusCode, out)
		}
	}
	// Failures still count per address.
	for i := 0; i < 10; i++ {
		c.ip = "203.0.113.31"
		if resp, out := login(c, "nobody@example.com", "wrong password!"); resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("failure %d = %d %v", i+1, resp.StatusCode, out)
		}
	}
	if resp, out := login(c, "owner@example.com", "correct horse battery"); resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "rate_limited" {
		t.Fatalf("after 10 failures = %d %v", resp.StatusCode, out)
	}
}

// TestLimitersPerPurpose: guessing reset links does not lock the same address
// out of signing in.
func TestLimitersPerPurpose(t *testing.T) {
	e := newEnv(t, false)
	registerOwner(e)
	c := newClientAt(e, "203.0.113.40")
	for i := 0; i < 12; i++ {
		c.do("GET", "/api/v1/password-resets/not-a-real-token-"+strconv.Itoa(i), nil)
		c.do("GET", "/api/v1/invitations/not-a-real-token-"+strconv.Itoa(i), nil)
	}
	resp, out := login(c, "owner@example.com", "correct horse battery")
	c.mustStatus(resp, http.StatusOK, out)
}

// TestAccountLockout: ten failed passwords for one account within the window
// lock it for every address, with account_locked and Retry-After.
func TestAccountLockout(t *testing.T) {
	e := newEnv(t, false)
	registerOwner(e)
	for i := 0; i < 10; i++ {
		c := newClientAt(e, "203.0.113."+strconv.Itoa(100+i))
		if resp, out := login(c, "Owner@Example.com", "wrong password!"); resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("failure %d = %d %v", i+1, resp.StatusCode, out)
		}
	}
	c := newClientAt(e, "203.0.113.200")
	resp, out := login(c, "owner@example.com", "correct horse battery")
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "account_locked" {
		t.Fatalf("locked account = %d %v", resp.StatusCode, out)
	}
	if ra, _ := strconv.Atoi(resp.Header.Get("Retry-After")); ra < 1 || ra > 15*60 {
		t.Fatalf("Retry-After = %q", resp.Header.Get("Retry-After"))
	}
}

// TestAccountFailuresResetOnSuccess: a successful sign-in clears the count.
func TestAccountFailuresResetOnSuccess(t *testing.T) {
	e := newEnv(t, false)
	registerOwner(e)
	n := 0
	for round := 0; round < 3; round++ {
		for i := 0; i < 9; i++ {
			n++
			c := newClientAt(e, "198.51.100."+strconv.Itoa(n))
			if resp, out := login(c, "owner@example.com", "wrong password!"); resp.StatusCode != http.StatusUnauthorized {
				t.Fatalf("round %d failure %d = %d %v", round, i+1, resp.StatusCode, out)
			}
		}
		resp, out := login(newClientAt(e, "198.51.100.250"), "owner@example.com", "correct horse battery")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("round %d success = %d %v", round, resp.StatusCode, out)
		}
	}
}

// TestReauthAccountLockout: wrong re-authentication passwords count against the
// account too.
func TestReauthAccountLockout(t *testing.T) {
	m := newMFAEnv(t)
	for i := 0; i < 10; i++ {
		m.ip = "203.0.113." + strconv.Itoa(150+i)
		if resp, out := m.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "wrong password"}); resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("attempt %d = %d %v", i+1, resp.StatusCode, out)
		}
	}
	m.ip = "203.0.113.170"
	resp, out := m.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"})
	if resp.StatusCode != http.StatusTooManyRequests || errCode(out) != "account_locked" {
		t.Fatalf("locked reauth = %d %v", resp.StatusCode, out)
	}
}

// TestSetupFromPublicAddressNeedsCode: without OPENTODO_SETUP_TOKEN, the first
// registration from a public address needs the setup code; from the local
// network it does not.
func TestSetupFromPublicAddressNeedsCode(t *testing.T) {
	e := newEnv(t, false)
	remote := newClientAt(e, "203.0.113.9")
	_, out := remote.do("GET", "/api/v1/auth/status", nil)
	if out["setupRequired"] != true || out["setupCodeRequired"] != true || out["setupTokenRequired"] != false {
		t.Fatalf("remote status = %v", out)
	}
	_, out = e.do("GET", "/api/v1/auth/status", nil)
	if out["setupCodeRequired"] != false {
		t.Fatalf("local status = %v", out)
	}
	for _, code := range []string{"", "AAAA-BBBB-CCCC-DDDD"} {
		resp, out := remote.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "password": "correct horse battery", "setupToken": code})
		if resp.StatusCode != http.StatusForbidden || errCode(out) != "setup_code_invalid" {
			t.Fatalf("remote register with %q = %d %v", code, resp.StatusCode, out)
		}
	}
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, http.StatusCreated, out)
}

// TestOriginMustMatchBaseURL: with OPENTODO_BASE_URL set, a page served under
// another host name (DNS rebinding) is cross-site even when Origin equals Host.
func TestOriginMustMatchBaseURL(t *testing.T) {
	base, _ := url.Parse("https://todo.example.com")
	check := func(cfg config.Config, host, origin string) bool {
		s := &Server{cfg: cfg}
		r := httptest.NewRequest("POST", "http://"+host+"/api/v1/auth/register", nil)
		r.Header.Set("Origin", origin)
		return s.originAllowed(r)
	}
	with := config.Config{BaseURL: base}
	if check(with, "rebind.example", "http://rebind.example") {
		t.Fatal("rebinding origin accepted with a base URL")
	}
	if !check(with, "todo.example.com", "https://todo.example.com") || !check(with, "10.0.0.5:8080", "https://todo.example.com") {
		t.Fatal("base URL origin refused")
	}
	if !check(with, "todo.example.com", "http://todo.example.com") {
		t.Fatal("same host behind a TLS proxy refused")
	}
	if !check(config.Config{}, "192.168.1.9:8080", "http://192.168.1.9:8080") {
		t.Fatal("without a base URL Origin equal to Host must pass")
	}
}

// TestSecureCookieOverTLS: the session cookie is Secure when the request came
// over TLS or a trusted proxy says https, even without an https base URL.
func TestSecureCookieOverTLS(t *testing.T) {
	e := newEnv(t, false)
	registerOwner(e)
	body, _ := json.Marshal(map[string]string{"email": "owner@example.com", "password": "correct horse battery"})
	signIn := func(target, peer, proto string) *http.Cookie {
		r := httptest.NewRequest("POST", target, bytes.NewReader(body))
		r.RemoteAddr = peer
		if proto != "" {
			r.Header.Set("X-Forwarded-Proto", proto)
		}
		w := httptest.NewRecorder()
		e.handler.ServeHTTP(w, r)
		for _, c := range w.Result().Cookies() {
			if c.Name == sessionCookie {
				return c
			}
		}
		t.Fatalf("no session cookie: %d %s", w.Code, w.Body)
		return nil
	}
	if c := signIn("https://todo.example.com/api/v1/auth/login", "198.51.100.2:1000", ""); !c.Secure {
		t.Error("TLS request: cookie not Secure")
	}
	if c := signIn("http://todo.example.com/api/v1/auth/login", "127.0.0.1:1000", "https"); !c.Secure {
		t.Error("trusted proxy says https: cookie not Secure")
	}
	if c := signIn("http://todo.example.com/api/v1/auth/login", "198.51.100.3:1000", "https"); c.Secure {
		t.Error("untrusted peer's X-Forwarded-Proto believed")
	}
}

// TestHSTSWithHTTPSBaseURL: an https base URL sends Strict-Transport-Security.
func TestHSTSWithHTTPSBaseURL(t *testing.T) {
	base, _ := url.Parse("https://todo.example.com")
	e := newEnvWith(t, false, func(s *Server) { s.cfg.BaseURL = base })
	resp, _ := e.do("GET", "/healthz", nil)
	if got := resp.Header.Get("Strict-Transport-Security"); got != "max-age=31536000" {
		t.Fatalf("HSTS = %q", got)
	}
	plain := newEnv(t, false)
	resp, _ = plain.do("GET", "/healthz", nil)
	if got := resp.Header.Get("Strict-Transport-Security"); got != "" {
		t.Fatalf("HSTS without a base URL = %q", got)
	}
	if strings.Contains(resp.Header.Get("Strict-Transport-Security"), "preload") {
		t.Fatal("preload")
	}
}
