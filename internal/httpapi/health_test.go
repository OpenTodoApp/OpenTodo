package httpapi

import (
	"net/http"
	"strings"
	"testing"
)

// TestHealthRouteAlias (OpenSpec health-route-alias): GET /api/v1/health answers
// exactly what /healthz answers, to anyone, so a client can check a server whose
// reverse proxy reserves /healthz (Pomerium, Cloud Run).
func TestHealthRouteAlias(t *testing.T) {
	e := newEnv(t, false)
	_, want := e.do("GET", "/healthz", nil)
	if want["status"] != "ok" || want["version"] == nil {
		t.Fatalf("/healthz = %v", want)
	}
	// Anonymous, signed in and with a read token: the same answer, no account data.
	check := func(who string, c *env, headers ...string) {
		t.Helper()
		resp, out := c.do("GET", "/api/v1/health", nil, headers...)
		c.mustStatus(resp, http.StatusOK, out)
		if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Fatalf("%s: Content-Type %q", who, ct)
		}
		if len(out) != 3 || out["status"] != want["status"] || out["version"] != want["version"] || out["app_sign_in"] != true {
			t.Fatalf("%s: /api/v1/health = %v, want %v", who, out, want)
		}
	}
	check("anonymous", e)
	e.register("owner@example.com")
	check("session", e)
	check("read token", e.bearerClient(), bearer(e.token("read"))...)
	// Only GET is the health check.
	if resp, out := e.do("POST", "/api/v1/health", nil); resp.StatusCode == http.StatusOK {
		t.Fatalf("POST /api/v1/health: %d %v", resp.StatusCode, out)
	}
}

// TestHealthRouteAliasUnhealthy: with the database gone both routes answer 503.
func TestHealthRouteAliasUnhealthy(t *testing.T) {
	e := newEnv(t, false)
	_ = e.db.Close()
	for _, path := range []string{"/healthz", "/api/v1/health"} {
		resp, out := e.do("GET", path, nil)
		e.mustStatus(resp, http.StatusServiceUnavailable, out)
		if errObj, _ := out["error"].(map[string]any); errObj["code"] != "unhealthy" {
			t.Fatalf("%s: %v", path, out)
		}
	}
}
