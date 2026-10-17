package httpapi

import (
	"context"
	"testing"

	"github.com/pixari/opentodo/internal/audit"
)

// token creates an API token with the given scope ("" leaves it out) as the
// signed-in user and returns its secret.
func (e *env) token(scope string) string {
	e.t.Helper()
	body := map[string]any{"name": "test " + scope}
	if scope != "" {
		body["scope"] = scope
	}
	resp, out := e.do("POST", "/api/v1/tokens", body)
	e.mustStatus(resp, 201, out)
	return out["secret"].(string)
}

func bearer(secret string) []string {
	return []string{"Authorization", "Bearer " + secret, "Cookie", ""}
}

// bearerClient is a cookie-less client of the same server.
func (e *env) bearerClient() *env { return newClientAt(e, "203.0.113.50") }

func TestReadTokenRefusedOnWrites(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Existing"})
	e.mustStatus(resp, 201, out)
	taskID := out["id"].(string)
	secret := e.token("read")
	c := e.bearerClient()
	before := countOps(t, e)
	for _, rt := range []struct {
		method, path string
		body         any
	}{
		{"POST", "/api/v1/tasks", map[string]any{"title": "Nope"}},
		{"PATCH", "/api/v1/tasks/" + taskID, map[string]any{"title": "Renamed"}},
		{"DELETE", "/api/v1/tasks/" + taskID, nil},
		{"POST", "/api/v1/sync", map[string]any{"device": "d", "cursor": 0, "ops": []any{}}},
		{"POST", "/api/v1/tokens", map[string]any{"name": "escalate", "scope": "full"}},
		{"PUT", "/api/v1/settings/mcp", map[string]any{"enabled": true}},
	} {
		resp, out := c.do(rt.method, rt.path, rt.body, bearer(secret)...)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Fatalf("%s %s with read token: %d %v", rt.method, rt.path, resp.StatusCode, out)
		}
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("ops changed: %d → %d", before, after)
	}
	// The token list labels the scope.
	resp, out = e.do("GET", "/api/v1/tokens", nil)
	e.mustStatus(resp, 200, out)
	if s := out["tokens"].([]any)[0].(map[string]any)["scope"]; s != "read" {
		t.Fatalf("listed scope = %v", s)
	}
	// Creation was audited with the scope; an unknown scope is refused.
	evs := e.events(audit.TokenCreatedName)
	if len(evs) == 0 || evs[len(evs)-1].Details["token_scope"] != "read" {
		t.Fatalf("token.created events = %+v", evs)
	}
	resp, out = e.do("POST", "/api/v1/tokens", map[string]any{"name": "x", "scope": "superuser"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("unknown scope: %d %v", resp.StatusCode, out)
	}
}

func TestReadTokenAllowedOnReads(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Visible"})
	e.mustStatus(resp, 201, out)
	secret := e.token("read")
	c := e.bearerClient()
	for _, p := range []string{"/api/v1/me", "/api/v1/tasks", "/api/v1/projects", "/api/v1/export", "/api/v1/tokens", "/api/v1/settings/mcp"} {
		resp, out := c.do("GET", p, nil, bearer(secret)...)
		c.mustStatus(resp, 200, out)
	}
}

func TestLegacyTokensKeepFullAccess(t *testing.T) {
	e := ownerEnv(t)
	full := e.token("") // no scope in the request: full, as before scopes existed
	// A token from before the migration has no scope row at all.
	legacy := e.token("full")
	if _, err := e.db.ExecContext(context.Background(), `DELETE FROM api_token_scopes WHERE scope = 'full'`); err != nil {
		t.Fatal(err)
	}
	c := e.bearerClient()
	for _, secret := range []string{full, legacy} {
		resp, out := c.do("POST", "/api/v1/tasks", map[string]any{"title": "From a script"}, bearer(secret)...)
		c.mustStatus(resp, 201, out)
		resp, out = c.do("POST", "/api/v1/sync", map[string]any{"device": "script", "cursor": 0, "ops": []any{}}, bearer(secret)...)
		c.mustStatus(resp, 200, out)
	}
	resp, out := e.do("GET", "/api/v1/tokens", nil)
	e.mustStatus(resp, 200, out)
	for _, tk := range out["tokens"].([]any) {
		if s := tk.(map[string]any)["scope"]; s != "full" {
			t.Fatalf("scope = %v", s)
		}
	}
}

func countOps(t *testing.T, e *env) int {
	t.Helper()
	var n int
	if err := e.db.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM ops`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
