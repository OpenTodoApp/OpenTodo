package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/pixari/opentodo/internal/demo"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// WithDemo turns on demo mode (OpenSpec `demo-mode`, `demo-sandboxes`):
// auth/status carries a sandbox-creation token, POST /api/v1/demo/sandbox
// creates a private sandbox, every route in demoRules answers 403
// demo_restricted before authentication, sandbox writes are bounded by the
// demo's write guard, and every response carries X-Robots-Tag.
func WithDemo(d *demo.Service) Option { return func(s *Server) { s.demo = d } }

// registerDemoRoutes adds the sandbox route on a demo instance only. It is
// unauthenticated by design (the visitor has no account yet); a single-use
// creation token from auth/status, the same-origin check and the limits in
// demo.CreateSandbox guard it (demo-sandboxes D2, D3).
func (s *Server) registerDemoRoutes(mux *http.ServeMux) {
	if s.demo == nil {
		return
	}
	mux.HandleFunc("POST /api/v1/demo/sandbox", s.handleDemoSandbox)
}

func (s *Server) handleDemoSandbox(w http.ResponseWriter, r *http.Request) {
	// Browsers send Origin on every POST from a page; a request without one did
	// not come from the sign-in page.
	if r.Header.Get("Origin") == "" || !s.originAllowed(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
		return
	}
	var in struct {
		Token string `json:"token"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	u, err := s.demo.CreateSandbox(r.Context(), in.Token, clientIP(r))
	switch {
	case errors.Is(err, demo.ErrBadToken):
		writeError(w, http.StatusForbidden, "demo_token", err.Error())
		return
	case errors.Is(err, demo.ErrRateLimited):
		writeError(w, http.StatusTooManyRequests, "rate_limited", err.Error())
		return
	case errors.Is(err, demo.ErrBusy):
		writeError(w, http.StatusServiceUnavailable, "demo_busy", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	s.startSession(w, r, u, http.StatusCreated, false)
}

// writeLimited answers a write refused by the demo's write budget (429
// demo_limit, nothing applied) and reports whether err was one.
func writeLimited(w http.ResponseWriter, err error) bool {
	if !errors.Is(err, opsync.ErrWriteLimit) {
		return false
	}
	msg := err.Error()
	if i := strings.Index(msg, ": "); i >= 0 {
		msg = msg[i+2:]
	}
	writeError(w, http.StatusTooManyRequests, "demo_limit", msg)
	return true
}

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
	{"AI assistants (MCP)", true, exact("/api/v1/me/agent-access")},
	// The in-app assistant would make outbound requests on the operator's key
	// (in-app-assistant): every method, so the app sees it as unavailable.
	{"The assistant", false, prefix("/api/v1/assistant")},
	{"The assistant", false, prefix("/api/v1/me/assistant")},
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
// handler unguarded: the mux redirects them to their clean form first. Every
// response, refused or not, tells search engines to stay away (demo-sandboxes D5).
func (s *Server) demoGuard(next http.Handler) http.Handler {
	if s.demo == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		if f := demoRestricted(r.Method, r.URL.Path); f != "" {
			writeError(w, http.StatusForbidden, "demo_restricted", f+" is disabled on this demo instance.")
			return
		}
		next.ServeHTTP(w, r)
	})
}
