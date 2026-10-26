package httpapi

import (
	"bytes"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Unit tests of trusted-client-identity's helpers (see client_identity_test.go).

// TestLimiterIPv6Per64: addresses in one IPv6 /64 share a window; IPv4 and
// other keys are unchanged.
func TestLimiterIPv6Per64(t *testing.T) {
	l := newRateLimiter(1, time.Minute)
	if !l.allow("2001:db8:1:2::1") {
		t.Fatal("first")
	}
	if l.allow("2001:db8:1:2:ffff:ffff:ffff:9") {
		t.Fatal("same /64 counted apart")
	}
	if !l.allow("2001:db8:1:3::1") || !l.allow("198.51.100.1") || !l.allow("::ffff:198.51.100.2") || l.allow("198.51.100.2") {
		t.Fatal("other keys")
	}
	for in, want := range map[string]string{"2001:db8::1": "2001:db8::/64", "203.0.113.5": "203.0.113.5", "::ffff:203.0.113.5": "203.0.113.5", "user:abc": "user:abc"} {
		if got := addrKey(in); got != want {
			t.Errorf("addrKey(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestLimiterSweepsOutsideHit: counting a hit never scans the table; the
// periodic sweep removes ended windows.
func TestLimiterSweepsOutsideHit(t *testing.T) {
	l := newRateLimiter(10, time.Minute)
	old := time.Now().Add(-time.Hour)
	for i := range 10001 {
		l.hits["k"+strconv.Itoa(i)] = &window{start: old, count: 1}
	}
	l.hit("fresh")
	if n := len(l.hits); n != 10002 {
		t.Fatalf("hit swept the table: %d keys", n)
	}
	limiterSweeper.run(time.Now())
	if n := len(l.hits); n != 1 {
		t.Fatalf("after sweep: %d keys", n)
	}
}

// TestSetupCodeFromLog: the code printed at startup admits the first
// registration from a public address, in any case and without dashes, and is
// gone once the owner exists.
func TestSetupCodeFromLog(t *testing.T) {
	var buf bytes.Buffer
	var srv *Server
	e := newEnvWith(t, false, withSetupCode, func(s *Server) {
		s.log = slog.New(slog.NewTextHandler(&buf, nil))
		srv = s
	})
	m := regexp.MustCompile(`setup code on the setup screen: ([A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4})`).FindStringSubmatch(buf.String())
	if m == nil || !strings.Contains(buf.String(), "level=WARN") {
		t.Fatalf("log: %s", buf.String())
	}
	code := m[1]
	remote := newClientAt(e, "203.0.113.9")
	resp, out := remote.do("POST", "/api/v1/auth/register", map[string]string{
		"email": "owner@example.com", "password": "correct horse battery", "setupToken": " " + strings.ToLower(strings.ReplaceAll(code, "-", "")) + " ",
	})
	remote.mustStatus(resp, http.StatusCreated, out)
	if u, _ := out["user"].(map[string]any); u["role"] != "owner" {
		t.Fatalf("role: %v", out)
	}
	if again, err := srv.auth.PrepareSetupCode(t.Context()); err != nil || again != "" {
		t.Fatalf("code after setup: %q %v", again, err)
	}
}

// TestNoSetupCodeWithToken: a configured setup token replaces the code, even
// with OPENTODO_SETUP_CODE=required.
func TestNoSetupCodeWithToken(t *testing.T) {
	var buf bytes.Buffer
	e := newEnvWith(t, false, withSetupCode, func(s *Server) {
		s.auth.SetSetupToken(testSetupToken)
		s.log = slog.New(slog.NewTextHandler(&buf, nil))
	})
	if strings.Contains(buf.String(), "setup code") {
		t.Fatalf("code printed with a token: %s", buf.String())
	}
	_, out := newClientAt(e, "203.0.113.9").do("GET", "/api/v1/auth/status", nil)
	if out["setupCodeRequired"] != false || out["setupTokenRequired"] != true {
		t.Fatalf("status: %v", out)
	}
}

// withSetupCode is OPENTODO_SETUP_CODE=required (auth-hardening D6).
func withSetupCode(s *Server) { s.auth.SetSetupCodeRequired(true) }

// TestSetupCodeOffByDefault (auth-hardening D6): without OPENTODO_SETUP_CODE
// no code is printed, the status asks for none, a first registration from a
// public address needs nothing, and the log says once who becomes the owner.
func TestSetupCodeOffByDefault(t *testing.T) {
	var buf bytes.Buffer
	e := newEnvWith(t, false, func(s *Server) { s.log = slog.New(slog.NewTextHandler(&buf, nil)) })
	if strings.Contains(buf.String(), "setup code on the setup screen") || strings.Count(buf.String(), "the first person to open this server becomes its owner") != 1 {
		t.Fatalf("log: %s", buf.String())
	}
	remote := newClientAt(e, "203.0.113.9")
	_, out := remote.do("GET", "/api/v1/auth/status", nil)
	if out["setupRequired"] != true || out["setupCodeRequired"] != false || out["setupTokenRequired"] != false {
		t.Fatalf("status: %v", out)
	}
	resp, out := remote.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "password": "correct horse battery"})
	remote.mustStatus(resp, http.StatusCreated, out)
}
