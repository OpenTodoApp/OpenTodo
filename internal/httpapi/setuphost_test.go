package httpapi

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/config"
	"github.com/OpenTodoApp/opentodo/internal/store/storetest"
	"github.com/OpenTodoApp/opentodo/internal/tenant/services"
)

// TestSetupHostVerified (host-check-without-base-url): IP addresses, names
// without a dot and local-only suffixes are verified hosts; any other domain
// name is not.
func TestSetupHostVerified(t *testing.T) {
	for host, want := range map[string]bool{
		"127.0.0.1:8080":          true,
		"192.168.1.20:8080":       true,
		"[::1]:8080":              true,
		"[fe80::1%25eth0]:8080":   true,
		"localhost:8080":          true,
		"LOCALHOST":               true,
		"nas:8080":                true,
		"opentodo.localhost":      true,
		"nas.local:8080":          true,
		"server.lan":              true,
		"pi.home.arpa":            true,
		"todo.internal.":          true,
		"todo.example.com:8080":   false,
		"rebind.example":          false,
		"192.168.1.20.nip.io":     false,
		"local.example.com":       false,
		"":                        false,
		"todo.example.com.local.": true,
	} {
		if got := setupHostVerified(host); got != want {
			t.Errorf("setupHostVerified(%q) = %v, want %v", host, got, want)
		}
	}
}

// TestSetupUnderDomainNameNeedsCode (host-check-without-base-url): without
// OPENTODO_BASE_URL and with the code off, the log carries a setup code; a
// first registration addressed to a domain name needs it, even when its
// Origin matches the host, while one addressed to an IP address does not.
func TestSetupUnderDomainNameNeedsCode(t *testing.T) {
	var buf bytes.Buffer
	e := newEnvWith(t, false, func(s *Server) { s.log = slog.New(slog.NewTextHandler(&buf, nil)) })
	m := regexp.MustCompile(`setup asks for this setup code: ([A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4})`).FindStringSubmatch(buf.String())
	if m == nil || strings.Count(buf.String(), "the first person to open this server becomes its owner") != 1 {
		t.Fatalf("log: %s", buf.String())
	}
	code := m[1]
	host := []string{"Host", "rebind.example", "Origin", "http://rebind.example"}
	_, out := e.do("GET", "/api/v1/auth/status", nil, host...)
	if out["setupCodeRequired"] != true || out["setupCodeForHost"] != true || out["setupTokenRequired"] != false {
		t.Fatalf("status under a domain name: %v", out)
	}
	_, out = e.do("GET", "/api/v1/auth/status", nil)
	if out["setupCodeRequired"] != false || out["setupCodeForHost"] != false {
		t.Fatalf("status under an IP address: %v", out)
	}
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "password": "correct horse battery"}, host...)
	if resp.StatusCode != http.StatusForbidden || errCode(out) != "setup_code_invalid" || !strings.Contains(errMessage(out), "OPENTODO_BASE_URL") {
		t.Fatalf("register under a domain name without the code = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "password": "correct horse battery", "setupToken": code}, host...)
	e.mustStatus(resp, http.StatusCreated, out)
}

// TestSetupOnLocalNameNeedsNoCode: a fresh install opened by its LAN name or
// IP address registers its owner without a code, as before.
func TestSetupOnLocalNameNeedsNoCode(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "password": "correct horse battery"},
		"Host", "nas.local:8080", "Origin", "http://nas.local:8080")
	e.mustStatus(resp, http.StatusCreated, out)
}

// TestNoHostCheckWithBaseURL: with OPENTODO_BASE_URL the origin check already
// pins the host, so the host check is off and no code is generated for it.
func TestNoHostCheckWithBaseURL(t *testing.T) {
	db, err := storetest.OpenDir(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	base, _ := url.Parse("https://todo.example.com")
	set := testSet(t, config.Config{SessionTTL: time.Hour, BaseURL: base}, db, services.Options{})
	if set.Auth.SetupCodeOnlyForHosts() {
		t.Fatal("host check on with a base URL")
	}
	if code, err := set.Auth.PrepareSetupCode(t.Context()); err != nil || code != "" {
		t.Fatalf("code with a base URL: %q %v", code, err)
	}
}
