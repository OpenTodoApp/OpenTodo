package httpapi

import (
	"net/http"
	"strings"

	"github.com/pixari/opentodo/internal/demo"
)

// WithDemo turns on demo mode (OpenSpec `demo-mode`): auth/status carries the
// public demo credentials and every route in demoRules answers 403
// demo_restricted before authentication.
func WithDemo(d *demo.Service) Option { return func(s *Server) { s.demo = d } }

// demoRule refuses requests to a feature on a demo instance. writes limits it
// to methods other than GET and HEAD; match receives the cleaned path.
type demoRule struct {
	feature string
	writes  bool
	match   func(path string) bool
}

func prefix(p string) func(string) bool {
	return func(s string) bool { return s == p || strings.HasPrefix(s, p+"/") }
}
func exact(p string) func(string) bool { return func(s string) bool { return s == p } }

// projectMembership matches /api/v1/projects/{id}/members[/...] and /transfer.
func projectMembership(p string) bool {
	rest, ok := strings.CutPrefix(p, "/api/v1/projects/")
	if !ok {
		return false
	}
	parts := strings.Split(rest, "/")
	return len(parts) >= 2 && (parts[1] == "members" || parts[1] == "transfer")
}

// demoRules is the lock-down list of design D4. Everything not listed (tasks,
// projects, labels, views, sections, reminders, comments, sync, export, trash,
// history, notifications) works as usual; rate limits stay in place.
var demoRules = []demoRule{
	{"Sign-up", true, exact("/api/v1/auth/register")},
	{"Single sign-on", false, prefix("/api/v1/auth/oidc")},
	{"Invitations", true, prefix("/api/v1/invitations")},
	{"User administration", true, prefix("/api/v1/users")},
	{"Password resets", false, prefix("/api/v1/password-resets")},
	{"Changing the password", true, exact("/api/v1/me/password")},
	{"Linked accounts", true, prefix("/api/v1/me/identities")},
	{"API tokens", true, prefix("/api/v1/tokens")},
	{"Passkeys", true, prefix("/api/v1/passkeys")},
	{"Two-factor authentication", true, prefix("/api/v1/mfa")},
	{"Two-factor authentication", true, prefix("/api/v1/members")},
	{"Server settings", true, prefix("/api/v1/settings")},
	{"App passwords", true, prefix("/api/v1/app-passwords")},
	{"CalDAV", false, prefix("/dav")},
	{"CalDAV", false, prefix("/.well-known/caldav")},
	{"AI assistants (MCP)", false, prefix("/mcp")},
	{"Backups", true, prefix("/api/v1/backups")},
	{"Webhooks", true, prefix("/api/v1/webhooks")},
	{"Email to task", true, prefix("/api/v1/email-inbox")},
	{"Import", true, prefix("/api/v1/import")},
	{"End-to-end encryption", true, prefix("/api/v1/encryption")},
	{"Web push", true, prefix("/api/v1/push")},
	{"Sharing changes", true, projectMembership},
}

// demoRestricted returns the refused feature's name, or "" when allowed.
func demoRestricted(method, path string) string {
	write := method != http.MethodGet && method != http.MethodHead
	for _, r := range demoRules {
		if r.writes && !write {
			continue
		}
		if r.match(path) {
			return r.feature
		}
	}
	return ""
}

// demoGuard wraps the router on a demo instance. Unclean paths never reach a
// handler unguarded: the mux redirects them to their clean form first.
func (s *Server) demoGuard(next http.Handler) http.Handler {
	if s.demo == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if f := demoRestricted(r.Method, r.URL.Path); f != "" {
			writeError(w, http.StatusForbidden, "demo_restricted", f+" is disabled on this demo instance.")
			return
		}
		next.ServeHTTP(w, r)
	})
}
