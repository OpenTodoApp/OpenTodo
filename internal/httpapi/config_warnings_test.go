package httpapi

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/config"
)

// TestConfigWarningsOwnerOnly (trusted-proxies-lenient): /api/v1/me carries
// config_warnings for the owner's session only; admins, members and API tokens
// (even the owner's) never see them.
func TestConfigWarningsOwnerOnly(t *testing.T) {
	t.Setenv("OPENTODO_TRUSTED_PROXIES", "cloudflar, 192.0.2.0/24")
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { setTrustedProxies(nil, false) })
	e := newEnvConfig(t, config.Config{Warnings: cfg.Warnings, TrustedProxies: cfg.TrustedProxies})
	e.register("o@example.com")

	resp, out := e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	ws, ok := out["config_warnings"].([]any)
	if !ok || len(ws) != 1 {
		t.Fatalf("owner: %v", out["config_warnings"])
	}
	w := ws[0].(map[string]any)
	if w["variable"] != "OPENTODO_TRUSTED_PROXIES" || !strings.Contains(w["message"].(string), `did you mean "cloudflare"?`) ||
		len(w["ignored"].([]any)) != 1 || w["ignored"].([]any)[0] != "cloudflar" {
		t.Fatalf("owner warning: %v", w)
	}

	hidden := func(who string, out map[string]any) {
		t.Helper()
		raw, _ := json.Marshal(out)
		if _, ok := out["config_warnings"]; ok || strings.Contains(string(raw), "cloudflar") {
			t.Fatalf("%s sees config warnings: %s", who, raw)
		}
	}
	for _, scope := range []string{"full", "read"} {
		resp, out = e.do("GET", "/api/v1/me", nil, bearer(e.token(scope))...)
		e.mustStatus(resp, 200, out)
		hidden("owner "+scope+" token", out)
	}
	member, _ := e.member("m@example.com", "203.0.113.20")
	resp, out = member.do("GET", "/api/v1/me", nil)
	member.mustStatus(resp, 200, out)
	hidden("member", out)
	admin, adminID := e.member("a@example.com", "203.0.113.21")
	resp, out = e.do("PUT", "/api/v1/users/"+adminID+"/role", map[string]string{"role": "admin"})
	e.mustStatus(resp, 200, out)
	resp, out = admin.do("GET", "/api/v1/me", nil)
	admin.mustStatus(resp, 200, out)
	hidden("admin", out)

	// No warnings: the owner gets an empty list, so the client can tell "none" from an older server.
	clean := newEnvConfig(t, config.Config{})
	clean.register("o@example.com")
	resp, out = clean.do("GET", "/api/v1/me", nil)
	clean.mustStatus(resp, 200, out)
	if ws, ok := out["config_warnings"].([]any); !ok || len(ws) != 0 {
		t.Fatalf("clean owner: %v", out["config_warnings"])
	}
}

// TestHealthyWithConfigWarnings: a configuration warning never fails /healthz.
func TestHealthyWithConfigWarnings(t *testing.T) {
	t.Setenv("OPENTODO_TRUSTED_PROXIES", "cloudflar")
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	e := newEnvConfig(t, config.Config{Warnings: cfg.Warnings})
	resp, out := e.do("GET", "/healthz", nil)
	e.mustStatus(resp, 200, out)
}
