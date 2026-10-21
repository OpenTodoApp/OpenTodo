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
func (s *Server) registerDemoRoutes(mux *routes) {
	if s.demo == nil {
		return
	}
	mux.handle("POST /api/v1/demo/sandbox", public("demo visitors have no account yet; a single-use token and the origin check guard it"), s.handleDemoSandbox)
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
		badBody(w, err)
		return
	}
	u, err := s.demo.CreateSandbox(r.Context(), in.Token, addrKey(clientIP(r)))
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
// demo_limit, nothing applied) or by a hosted tenant's limit (403 with the
// limit's reason as code, multi-tenant-host D5) and reports whether err was one.
func writeLimited(w http.ResponseWriter, err error) bool {
	var rej *opsync.RejectedError
	if errors.As(err, &rej) && opsync.IsLimitReason(rej.Reason) {
		writeError(w, http.StatusForbidden, rej.Reason, limitMessage(rej.Reason))
		return true
	}
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

// taskAttachments matches /api/v1/tasks/{id}/attachments (OpenSpec `attachments`).
func taskAttachments(p string) bool {
	rest, ok := strings.CutPrefix(p, "/api/v1/tasks/")
	if !ok {
		return false
	}
	parts := strings.Split(rest, "/")
	return len(parts) >= 2 && parts[1] == "attachments"
}

// projectInvites matches /api/v1/projects/{id}/invites[/...] (OpenSpec
// `project-invite-links`).
func projectInvites(p string) bool {
	rest, ok := strings.CutPrefix(p, "/api/v1/projects/")
	if !ok {
		return false
	}
	parts := strings.Split(rest, "/")
	return len(parts) >= 2 && parts[1] == "invites"
}

// projectPublicLinks matches /api/v1/projects/{id}/public-links[/...]
// (OpenSpec `public-links`).
func projectPublicLinks(p string) bool {
	rest, ok := strings.CutPrefix(p, "/api/v1/projects/")
	if !ok {
		return false
	}
	parts := strings.Split(rest, "/")
	return len(parts) >= 2 && parts[1] == "public-links"
}

// taskPage matches /api/v1/tasks/{id}/page[/...] (OpenSpec `task-pages`).
func taskPage(p string) bool {
	rest, ok := strings.CutPrefix(p, "/api/v1/tasks/")
	if !ok {
		return false
	}
	parts := strings.Split(rest, "/")
	return len(parts) >= 2 && parts[1] == "page"
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
	{"Password resets", false, prefix("/api/v1/auth/password-reset")},
	{"Sign-up", false, prefix("/api/v1/auth/verify")},
	{"Changing the password", true, exact("/api/v1/me/password")},
	{"Signing out everywhere", true, exact("/api/v1/me/sign-out-everywhere")},
	{"Linked accounts", true, prefix("/api/v1/me/identities")},
	{"API tokens", true, prefix("/api/v1/tokens")},
	{"Passkeys", true, prefix("/api/v1/passkeys")},
	{"Two-factor authentication", true, prefix("/api/v1/mfa")},
	{"Two-factor authentication", true, prefix("/api/v1/members")},
	// Files would let sandboxes store and serve arbitrary content (attachments
	// D15): every method, so the app hides the controls.
	{"Attachments", false, prefix("/api/v1/attachments")},
	{"Attachments", false, taskAttachments},
	{"Attachments", false, exact("/api/v1/settings/attachments")},
	{"Outgoing email", false, prefix("/api/v1/settings/smtp")},
	// The weekly digest sends mail (stats-and-review): changing it is refused.
	{"Email digest", true, exact("/api/v1/me/email-digest")},
	// Public links publish data to anyone (public-links D9): every method.
	{"Public links", false, projectPublicLinks},
	{"Public links", false, prefix("/api/v1/public")},
	// Task pages publish a task to anyone (task-pages D7): every method.
	{"Task pages", false, taskPage},
	{"Task pages", false, prefix("/api/v1/task-pages")},
	{"Task pages", false, prefix("/api/v1/pages")},
	{"Server settings", true, prefix("/api/v1/settings")},
	{"App passwords", true, prefix("/api/v1/app-passwords")},
	{"Calendar feeds", false, prefix("/api/v1/calendar-feeds")},
	{"Calendar feeds", false, prefix("/feeds")},
	{"Calendar feeds", false, exact("/api/v1/settings/calendar-feeds")},
	// Issue connections would send a visitor's token to a visitor's host
	// (issue-import D10): every method.
	{"Issue connections", false, prefix("/api/v1/issues")},
	{"Issue connections", false, exact("/api/v1/settings/issues")},
	{"CalDAV", false, prefix("/dav")},
	{"CalDAV", false, prefix("/.well-known/caldav")},
	{"AI assistants (MCP)", false, prefix("/mcp")},
	{"AI assistants (MCP)", true, exact("/api/v1/me/agent-access")},
	// The device relay serves encrypted accounts' MCP calls (mcp-device-relay):
	// every method, like /mcp itself.
	{"AI assistants (MCP)", false, prefix("/api/v1/relay")},
	// The in-app assistant would make outbound requests on the operator's key
	// (in-app-assistant): every method, so the app sees it as unavailable.
	{"The assistant", false, prefix("/api/v1/assistant")},
	{"The assistant", false, prefix("/api/v1/me/assistant")},
	// Listing archives contacts the destination, and restore is never for a
	// demo (backup-restore-web): every method.
	{"Backups", false, exact("/api/v1/backups/archives")},
	{"Backups", false, prefix("/api/v1/backups/restore")},
	{"Backups", true, prefix("/api/v1/backups")},
	{"Webhooks", true, prefix("/api/v1/webhooks")},
	{"Email to task", true, prefix("/api/v1/email-inbox")},
	{"Import", true, prefix("/api/v1/import")},
	// Only hosted tenants register it (multi-tenant-host), never a demo: listed
	// so the whole-server archive stays refused should that ever change.
	{"Backups", false, exact("/api/v1/export/archive")},
	{"End-to-end encryption", true, prefix("/api/v1/encryption")},
	{"Web push", true, prefix("/api/v1/push")},
	{"Sharing changes", true, projectMembership},
	// Every method: links would let one sandbox join another's project.
	{"Project invite links", false, projectInvites},
	{"Project invite links", false, prefix("/api/v1/project-invites")},
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

// limitMessage explains a hosted tenant's limit refusal (multi-tenant-host D5).
func limitMessage(reason string) string {
	switch reason {
	case opsync.ReasonLimitStorage:
		return "this server reached its storage limit: empty the Trash or ask the operator for more space"
	case opsync.ReasonLimitOpsHour:
		return "this server reached its limit of changes per hour: try again later"
	case opsync.ReasonLimitOpsTotal:
		return "this server reached its limit of stored changes"
	}
	return "this server reached a limit"
}
