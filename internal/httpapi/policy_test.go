package httpapi

import (
	"context"
	"fmt"
	"go/ast"
	"go/parser"
	gotoken "go/token"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/demo"
	"github.com/pixari/opentodo/internal/push"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Route authorization policy (OpenSpec change `route-authorization-policy`).

// routeTableOf builds a server with every conditional feature on (web app,
// web push, demo, hosted tenant) and returns its recorded route table.
func routeTableOf(t *testing.T, demoMode bool) []routeEntry {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour, DataDir: dir, Demo: demoMode}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	authSvc := auth.NewService(db, cfg.SessionTTL, false)
	var srv *Server
	opts := []Option{WithHosted(), WithPush(push.New(db, syncSvc, dir, push.Options{AllowHTTP: true, Client: http.DefaultClient})),
		func(s *Server) { srv = s }}
	if demoMode {
		d := demo.New(authSvc, syncSvc, log)
		if err := d.Start(context.Background()); err != nil {
			t.Fatal(err)
		}
		opts = append(opts, WithDemo(d))
	}
	New(cfg, authSvc, syncSvc, http.NotFoundHandler(), log, "test", opts...)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	if srv == nil || len(srv.routeTable) < 150 {
		t.Fatalf("route table not recorded")
	}
	return srv.routeTable
}

// TestEveryRouteDeclaresAPolicy: every route is registered through the policy
// wrapper with a valid policy, and no source file registers a handler on a
// ServeMux directly (which would bypass the policy).
func TestEveryRouteDeclaresAPolicy(t *testing.T) {
	table := routeTableOf(t, true)
	got := map[string]routePolicy{}
	for _, e := range table {
		if _, dup := got[e.pattern]; dup {
			t.Errorf("%s registered twice", e.pattern)
		}
		got[e.pattern] = e.policy
		switch {
		case e.policy.kind == kindUnset:
			t.Errorf("%s has no policy", e.pattern)
		case e.policy.kind == kindPublic && e.policy.reason == "":
			t.Errorf("public route %s has no reason", e.pattern)
		case e.policy.kind == kindPublic && (e.policy.role != anyRole || e.policy.tokens != tokensByMethod || e.policy.fresh):
			t.Errorf("public route %s declares sign-in rules it cannot enforce", e.pattern)
		}
	}
	for _, p := range registeredPatterns(t) {
		if _, ok := got[p]; !ok {
			t.Errorf("%s appears in the sources but not in the route table", p)
		}
	}
	// Direct registrations bypass the policy: only policy.go may call
	// ServeMux.Handle, and nothing calls HandleFunc.
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	fset := gotoken.NewFileSet()
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") || f == "policy.go" {
			continue
		}
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		file, err := parser.ParseFile(fset, f, src, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(file, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			if sel, ok := call.Fun.(*ast.SelectorExpr); ok && (sel.Sel.Name == "Handle" || sel.Sel.Name == "HandleFunc") && len(call.Args) == 2 {
				t.Errorf("%s: %s registers a route without a policy; use routes.handle", fset.Position(call.Pos()), sel.Sel.Name)
			}
			return true
		})
	}
}

// describe renders a policy for the table below.
func describe(p routePolicy) string {
	if p.kind == kindPublic {
		if p.demo {
			return "public demo"
		}
		return "public"
	}
	parts := []string{"auth"}
	switch p.role {
	case ownerRole:
		parts = append(parts, "owner")
	case adminRole:
		parts = append(parts, "admins")
	}
	switch p.tokens {
	case tokensFull:
		parts = append(parts, "full-tokens")
	case tokensAdmin:
		parts = append(parts, "admin-token")
	case tokensNone:
		parts = append(parts, "session-only")
	}
	if p.fresh {
		parts = append(parts, "fresh")
	}
	if p.demo {
		parts = append(parts, "demo")
	}
	return strings.Join(parts, " ")
}

// TestSecurityRoutePolicies pins the policy of the security-relevant routes:
// credentials, administration, secrets and the anonymous sign-in routes.
func TestSecurityRoutePolicies(t *testing.T) {
	want := map[string]string{
		// Anonymous by design.
		"GET /healthz":                         "public",
		"POST /api/v1/auth/login":              "public",
		"POST /api/v1/auth/register":           "public demo",
		"POST /api/v1/auth/mfa":                "public",
		"GET /api/v1/password-resets/{token}":  "public demo",
		"POST /api/v1/password-resets/{token}": "public demo",
		"GET /api/v1/invitations/{token}":      "public",
		"/dav/":                                "public demo",
		"/mcp":                                 "public demo",
		// API tokens and app passwords: minting needs a fresh session or an admin token.
		"GET /api/v1/tokens":                  "auth",
		"POST /api/v1/tokens":                 "auth admin-token fresh demo",
		"DELETE /api/v1/tokens/{id}":          "auth demo",
		"POST /api/v1/app-passwords":          "auth admin-token fresh demo",
		"DELETE /api/v1/app-passwords/{id}":   "auth demo",
		"POST /api/v1/me/sign-out-everywhere": "auth session-only fresh demo",
		// Second factor and passkeys.
		"POST /api/v1/mfa/totp/enroll":               "auth admin-token demo",
		"POST /api/v1/mfa/totp/confirm":              "auth admin-token demo",
		"DELETE /api/v1/mfa/totp":                    "auth admin-token fresh demo",
		"POST /api/v1/mfa/recovery-codes/regenerate": "auth admin-token fresh demo",
		"POST /api/v1/passkeys/register/options":     "auth admin-token demo",
		"POST /api/v1/passkeys/register":             "auth admin-token demo",
		"PATCH /api/v1/passkeys/{id}":                "auth admin-token demo",
		"DELETE /api/v1/passkeys/{id}":               "auth admin-token demo",
		"DELETE /api/v1/me/identities/{id}":          "auth admin-token demo",
		"POST /api/v1/me/password":                   "auth admin-token fresh demo",
		// User administration.
		"GET /api/v1/users":                          "auth admins",
		"PUT /api/v1/users/{id}/role":                "auth admins admin-token fresh demo",
		"POST /api/v1/users/{id}/deactivate":         "auth admins admin-token fresh demo",
		"POST /api/v1/users/{id}/reactivate":         "auth admins admin-token fresh demo",
		"DELETE /api/v1/users/{id}":                  "auth admins admin-token fresh demo",
		"POST /api/v1/users/{id}/password-reset":     "auth admins admin-token fresh demo",
		"POST /api/v1/users/{id}/transfer-ownership": "auth admins admin-token fresh demo",
		"GET /api/v1/invitations":                    "auth admins",
		"POST /api/v1/invitations":                   "auth admins admin-token fresh demo",
		"DELETE /api/v1/invitations/{id}":            "auth admins admin-token demo",
		"GET /api/v1/settings/mfa":                   "auth owner",
		"PUT /api/v1/settings/mfa":                   "auth owner admin-token fresh demo",
		"POST /api/v1/members/{id}/mfa/reset":        "auth owner admin-token fresh demo",
		"GET /api/v1/audit":                          "auth owner",
		"GET /api/v1/audit/export":                   "auth owner",
		// Server settings that hold secrets, and the encryption key record.
		"GET /api/v1/settings/oidc":        "auth owner",
		"PUT /api/v1/settings/oidc":        "auth owner admin-token fresh demo",
		"POST /api/v1/settings/oidc/test":  "auth owner demo",
		"GET /api/v1/settings/smtp":        "auth owner admin-token demo",
		"PUT /api/v1/settings/smtp":        "auth owner admin-token fresh demo",
		"PUT /api/v1/backups/settings":     "auth owner admin-token demo",
		"PUT /api/v1/settings/assistant":   "auth owner admin-token demo",
		"PUT /api/v1/encryption/keys":      "auth admin-token demo",
		"DELETE /api/v1/encryption/keys":   "auth admin-token fresh demo",
		"GET /api/v1/settings/webhooks":    "auth owner",
		"PUT /api/v1/settings/webhooks":    "auth owner demo",
		"PUT /api/v1/settings/mcp":         "auth owner demo",
		"PUT /api/v1/settings/caldav":      "auth owner demo",
		"PUT /api/v1/settings/attachments": "auth owner demo",
		// Owner data and restore.
		"GET /api/v1/backups":                                 "auth owner",
		"POST /api/v1/backups/restore":                        "auth owner session-only fresh demo",
		"DELETE /api/v1/backups/restore/safety-copies/{name}": "auth owner session-only fresh demo",
		"GET /api/v1/export/archive":                          "auth owner admin-token fresh demo",
		// Switches only a person flips.
		"GET /api/v1/me/agent-access":    "auth full-tokens",
		"PUT /api/v1/me/agent-access":    "auth full-tokens demo",
		"POST /api/v1/assistant/turn":    "auth session-only demo",
		"POST /api/v1/me/assistant/test": "auth session-only demo",
		// Regular content routes.
		"POST /api/v1/sync":                       "auth",
		"POST /api/v1/{collection}":               "auth",
		"POST /api/v1/projects/{id}/public-links": "auth fresh demo",
	}
	got := map[string]string{}
	for _, e := range routeTableOf(t, true) {
		got[e.pattern] = describe(e.policy)
	}
	for pattern, w := range want {
		g, ok := got[pattern]
		if !ok {
			t.Errorf("%s is not registered", pattern)
			continue
		}
		if g != w {
			t.Errorf("%s: policy %q, want %q", pattern, g, w)
		}
	}
}

var wildcard = regexp.MustCompile(`\{[^}]*\}`)

// samplePath turns a pattern's path into a concrete one ("{id}" → "x").
func samplePath(path string) string { return wildcard.ReplaceAllString(path, "x") }

// TestDemoDenyListMatchesPolicy: the demo deny list (demoRules, applied before
// routing) refuses exactly the routes whose policy says demoDenied, and every
// route that changes credentials, administration or owner settings is among them.
func TestDemoDenyListMatchesPolicy(t *testing.T) {
	for _, e := range routeTableOf(t, true) {
		method, path, ok := strings.Cut(e.pattern, " ")
		methods := []string{method}
		if !ok {
			path, methods = e.pattern, []string{"GET", "POST"}
		}
		denied := false
		for _, m := range methods {
			denied = denied || demoRestricted(m, samplePath(path)) != ""
		}
		if denied != e.policy.demo {
			t.Errorf("%s: demo deny list says %v, policy says %v", e.pattern, denied, e.policy.demo)
		}
		write := ok && method != "GET" && method != "HEAD"
		privileged := e.policy.role != anyRole || e.policy.tokens == tokensAdmin || e.policy.tokens == tokensNone
		if write && privileged && !e.policy.demo {
			t.Errorf("%s changes credentials, administration or settings but is allowed on a demo", e.pattern)
		}
	}
}

// policyEnv is the owner (fresh session) with a full, an admin and a read token.
type policyEnv struct {
	*mfaEnv
	full, admin, read string
}

func newPolicyEnv(t *testing.T) *policyEnv {
	t.Helper()
	m := newMFAEnv(t)
	p := &policyEnv{mfaEnv: m}
	for scope, dst := range map[string]*string{"full": &p.full, "admin": &p.admin, "read": &p.read} {
		resp, out := m.do("POST", "/api/v1/tokens", map[string]string{"name": scope + " script", "scope": scope})
		m.mustStatus(resp, 201, out)
		*dst = out["secret"].(string)
	}
	return p
}

// as sends a request with a bearer token from a separate client.
func (p *policyEnv) as(token, method, path string, body any) (*http.Response, map[string]any) {
	p.t.Helper()
	c := newClientAt(p.env, "203.0.113.90")
	return c.do(method, path, body, "Authorization", "Bearer "+token)
}

// TestCredentialRoutesNeedAdminToken (SEC-3): a full token is refused on every
// credential and administration route that changes something, an admin token
// is accepted, and a read token stays read-only. Full tokens keep everything else.
func TestCredentialRoutesNeedAdminToken(t *testing.T) {
	p := newPolicyEnv(t)
	resp, out := p.do("POST", "/api/v1/invitations", map[string]any{})
	p.mustStatus(resp, 201, out)
	inviteID := out["invitation"].(map[string]any)["id"].(string)
	type req struct {
		method, path string
		body         any
	}
	routes := []req{
		{"POST", "/api/v1/tokens", map[string]string{"name": "minted"}},
		{"POST", "/api/v1/app-passwords", map[string]string{"name": "phone"}},
		{"POST", "/api/v1/mfa/totp/enroll", nil},
		{"DELETE", "/api/v1/mfa/totp", nil},
		{"POST", "/api/v1/mfa/recovery-codes/regenerate", nil},
		{"POST", "/api/v1/passkeys/register/options", nil},
		{"DELETE", "/api/v1/passkeys/nope", nil},
		{"POST", "/api/v1/me/password", map[string]string{"currentPassword": "wrong", "newPassword": "another long password"}},
		{"POST", "/api/v1/invitations", map[string]any{}},
		{"DELETE", "/api/v1/invitations/" + inviteID, nil},
		{"POST", "/api/v1/users/nope/password-reset", nil},
		{"PUT", "/api/v1/users/nope/role", map[string]string{"role": "admin"}},
		{"DELETE", "/api/v1/users/nope", map[string]string{"confirmEmail": "x"}},
		{"POST", "/api/v1/members/nope/mfa/reset", nil},
		{"PUT", "/api/v1/settings/mfa", map[string]string{"required": "none"}},
		{"PUT", "/api/v1/settings/oidc", map[string]any{"displayName": "SSO"}},
		{"PUT", "/api/v1/settings/smtp", map[string]any{}},
		{"PUT", "/api/v1/encryption/keys", map[string]any{}},
		{"DELETE", "/api/v1/encryption/keys", nil},
		{"PUT", "/api/v1/backups/settings", map[string]any{}},
		{"PUT", "/api/v1/settings/assistant", map[string]any{}},
	}
	for _, r := range routes {
		resp, out := p.as(p.full, r.method, r.path, r.body)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" || !strings.Contains(fmt.Sprint(out), "admin API token") {
			t.Errorf("full token on %s %s = %d %v, want 403 insufficient_scope", r.method, r.path, resp.StatusCode, out)
		}
		resp, out = p.as(p.read, r.method, r.path, r.body)
		if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
			t.Errorf("read token on %s %s = %d %v", r.method, r.path, resp.StatusCode, out)
		}
		resp, out = p.as(p.admin, r.method, r.path, r.body)
		if resp.StatusCode == 401 || (resp.StatusCode == 403 && (errCode(out) == "insufficient_scope" || errCode(out) == "reauth_required")) {
			t.Errorf("admin token on %s %s = %d %v, want it admitted", r.method, r.path, resp.StatusCode, out)
		}
	}
	// Full tokens keep the regular routes, revoking and reading credentials.
	resp, out = p.as(p.full, "POST", "/api/v1/tasks", map[string]any{"title": "From a script"})
	p.mustStatus(resp, 201, out)
	for _, path := range []string{"/api/v1/tokens", "/api/v1/users", "/api/v1/settings/oidc", "/api/v1/mfa"} {
		resp, out = p.as(p.full, "GET", path, nil)
		p.mustStatus(resp, 200, out)
	}
	// The admin token is reported as such and works on regular routes too.
	resp, out = p.as(p.admin, "GET", "/api/v1/me", nil)
	p.mustStatus(resp, 200, out)
	if cred := out["auth"].(map[string]any); cred["scope"] != "admin" {
		t.Fatalf("credential of the admin token = %v", cred)
	}
	resp, out = p.as(p.admin, "POST", "/api/v1/tasks", map[string]any{"title": "From an admin script"})
	p.mustStatus(resp, 201, out)
}

// TestAdminTokenOnlyFromFreshSession (SEC-3): an admin token is created only
// by a recently confirmed session, never by another token.
func TestAdminTokenOnlyFromFreshSession(t *testing.T) {
	p := newPolicyEnv(t)
	resp, out := p.as(p.admin, "POST", "/api/v1/tokens", map[string]string{"name": "again", "scope": "admin"})
	if resp.StatusCode != 403 || errCode(out) != "session_required" {
		t.Fatalf("admin token mints an admin token = %d %v", resp.StatusCode, out)
	}
	resp, out = p.as(p.admin, "POST", "/api/v1/tokens", map[string]string{"name": "child", "scope": "full"})
	p.mustStatus(resp, 201, out)
	p.clock.advance(FreshWindow + time.Second)
	resp, out = p.do("POST", "/api/v1/tokens", map[string]string{"name": "stale", "scope": "admin"})
	if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale session mints an admin token = %d %v", resp.StatusCode, out)
	}
	resp, out = p.do("POST", "/api/v1/auth/reauth", map[string]string{"password": "correct horse battery"})
	p.mustStatus(resp, 200, out)
	resp, out = p.do("POST", "/api/v1/tokens", map[string]string{"name": "fresh", "scope": "admin"})
	p.mustStatus(resp, 201, out)
	if out["token"].(map[string]any)["scope"] != "admin" {
		t.Fatalf("created token = %v", out)
	}
	// Stored as read plus a marker: read-only to a binary that does not know it.
	id := out["token"].(map[string]any)["id"].(string)
	var stored string
	var marked int
	_ = p.db.QueryRow(`SELECT scope FROM api_token_scopes WHERE token_id = ?`, id).Scan(&stored)
	_ = p.db.QueryRow(`SELECT COUNT(*) FROM api_token_admin WHERE token_id = ?`, id).Scan(&marked)
	if stored != "read" || marked != 1 {
		t.Fatalf("stored scope %q, marker %d", stored, marked)
	}
}

// TestPreScopeTokensAreFull: a token without a scope row (created before
// scopes) keeps full access and, like every full token, is refused on the
// credential routes.
func TestPreScopeTokensAreFull(t *testing.T) {
	p := newPolicyEnv(t)
	var uid string
	if err := p.db.QueryRow("SELECT id FROM users WHERE email = 'owner@example.com'").Scan(&uid); err != nil {
		t.Fatal(err)
	}
	_, plain, err := auth.NewService(p.db, time.Hour, false).CreateToken(t.Context(), uid, "old")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.db.Exec(`DELETE FROM api_token_scopes WHERE token_id = (SELECT id FROM api_tokens WHERE name = 'old')`); err != nil {
		t.Fatal(err)
	}
	resp, out := p.as(plain, "POST", "/api/v1/tasks", map[string]any{"title": "Old script"})
	p.mustStatus(resp, 201, out)
	resp, out = p.as(plain, "POST", "/api/v1/tokens", map[string]string{"name": "minted"})
	if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("pre-scope token mints a token = %d %v", resp.StatusCode, out)
	}
}

// TestRolePolicyBeforeCredentials: a member is told "forbidden" on an owner
// route whatever the credential, before any freshness or scope rule.
func TestRolePolicyBeforeCredentials(t *testing.T) {
	m := newMFAEnv(t)
	mc, _ := m.member("member@example.com", "203.0.113.70")
	m.clock.advance(FreshWindow + time.Second)
	for _, r := range [][2]string{{"PUT", "/api/v1/settings/oidc"}, {"PUT", "/api/v1/settings/smtp"}, {"GET", "/api/v1/audit"}, {"PUT", "/api/v1/users/x/role"}} {
		resp, out := mc.do(r[0], r[1], map[string]any{})
		if resp.StatusCode != 403 || errCode(out) != "forbidden" {
			t.Errorf("member on %s %s = %d %v", r[0], r[1], resp.StatusCode, out)
		}
	}
}
