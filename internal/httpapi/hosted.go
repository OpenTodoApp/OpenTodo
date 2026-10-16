package httpapi

import (
	"net/http"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
)

// WithHosted marks a tenant served by a host (OpenSpec `multi-tenant-host`,
// design D4, D7): the operator-level settings in hostRules answer 403
// host_managed, auth/status says hosted, and the owner can download the
// tenant as a backup archive.
func WithHosted() Option { return func(s *Server) { s.hosted = true } }

// hostRules are the settings a host's operator owns (design D4). writes
// limits a rule to methods other than GET and HEAD, where reading the current
// value is harmless and the app needs it (whether MCP or the assistant is on).
var hostRules = []demoRule{
	{"Outgoing email", false, prefix("/api/v1/settings/smtp")},
	{"Single sign-on", false, prefix("/api/v1/settings/oidc")},
	{"Backups", false, prefix("/api/v1/backups")},
	{"AI assistants (MCP)", true, prefix("/api/v1/settings/mcp")},
	{"The assistant", true, prefix("/api/v1/settings/assistant")},
	{"Webhook network policy", true, prefix("/api/v1/settings/webhooks")},
	{"Attachment limits", true, prefix("/api/v1/settings/attachments")},
}

// hostManaged returns the operator-owned feature a request reaches, or "".
func hostManaged(method, path string) string {
	write := method != http.MethodGet && method != http.MethodHead
	for _, r := range hostRules {
		if r.writes && !write {
			continue
		}
		if r.match(path) {
			return r.feature
		}
	}
	return ""
}

// hostGuard wraps the router of a hosted tenant. Like demoGuard it runs before
// authentication: nobody reaches an operator setting through a tenant.
func (s *Server) hostGuard(next http.Handler) http.Handler {
	if !s.hosted {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if f := hostManaged(r.Method, r.URL.Path); f != "" {
			writeError(w, http.StatusForbidden, "host_managed", f+" is managed by the operator of this hosted service.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// registerHostedRoutes adds the owner's archive download on a hosted tenant.
func (s *Server) registerHostedRoutes(mux *http.ServeMux) {
	if !s.hosted {
		return
	}
	mux.Handle("GET /api/v1/export/archive", s.requireAuth(s.requireFresh(s.handleArchiveDownload)))
}

// handleArchiveDownload streams the whole tenant as a backup archive, the
// format `opentodo restore` reads (multi-tenant-host "Owners can take their
// data away"). Owner only, from a recently confirmed session or a full token.
func (s *Server) handleArchiveDownload(w http.ResponseWriter, r *http.Request) {
	if !requireOwner(w, r, "the server archive") {
		return
	}
	// The archive holds every account's credentials: never for a read or agent token.
	if tokenFrom(r.Context()).Scope != auth.ScopeFull {
		writeError(w, http.StatusForbidden, "insufficient_scope", "downloading the server archive needs a session or a full API token")
		return
	}
	if s.backups == nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable", "archives are not available on this server")
		return
	}
	ctx := r.Context()
	name, err := s.backups.ExportName(ctx)
	if err != nil {
		s.internal(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	w.Header().Set("Cache-Control", "no-store")
	// A large archive takes longer than the server's write deadline.
	_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})
	if err := s.backups.Export(ctx, w); err != nil {
		// Headers are gone; the truncated body fails the archive's checks.
		s.log.Error("archive download failed", "err", err)
		return
	}
	s.audit.Record(ctx, audit.ExportRequested(userFrom(ctx).ID, "archive"))
}
