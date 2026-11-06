package httpapi

import (
	"errors"
	"log/slog"
	"mime"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/httpapi/httpx"
)

// Middleware: authentication, origin checks, security headers and request
// logging.

// auditContext hands the client address and user agent to the audit recorder.
// The address is stored only when the owner enabled address logging.
func auditContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(audit.WithRequest(r.Context(), clientIP(r), r.UserAgent())))
	})
}

func (s *Server) requireAuth(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, sess, viaCookie, tok, err := s.authenticateScoped(r)
		scope := tok.Scope
		if err != nil {
			s.log.Error("auth lookup failed", "err", err)
			writeError(w, http.StatusInternalServerError, "internal", "internal error")
			return
		}
		if u == nil {
			if s.demo != nil && viaCookie {
				// On a demo instance only sandboxes hold sessions; a session cookie
				// that no longer resolves belonged to a deleted sandbox (demo-sandboxes D4).
				writeError(w, http.StatusUnauthorized, "demo_expired", "your demo sandbox has expired")
				return
			}
			writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		ctx := httpx.WithUser(r.Context(), u, tok)
		// Only sessions, full and admin tokens reach a handler that writes: read tokens
		// (mcp-server D2) and agent tokens (mcp-write-tools D2) are refused, and
		// so is any scope this binary does not know (fail closed). The one
		// exception is the fixed list of agent content routes (agent-ready-cli
		// D8): an agent token's write there never reaches the regular handler but
		// runs through the agent tool registry, with its switches, limits and
		// audit (agent_rest.go).
		if !auth.FullAccess(scope) && isWriteRequest(r) {
			if scope == auth.ScopeAgent && agentRoute(r) != "" {
				s.handleAgentWrite(w, r.WithContext(ctx), u, tok)
				return
			}
			msg := "this API token is read-only"
			if scope == auth.ScopeAgent {
				msg = "this API token is for AI assistants: it can create and edit tasks, projects, sections, labels, comments, reminders and time entries, and nothing else (see docs/api.md#agent-tokens)"
			}
			writeError(w, http.StatusForbidden, "insufficient_scope", msg)
			return
		}
		if viaCookie && r.Method != http.MethodGet && r.Method != http.MethodHead && !s.cookieWriteAllowed(r) {
			msg := "cross-site request rejected"
			if r.Header.Get("Origin") == "" {
				msg = "a write with the session cookie and no Origin must come from this server's pages or send a JSON body: use an API token for scripts, or update the browser"
			}
			writeError(w, http.StatusForbidden, "bad_origin", msg)
			return
		}
		// Owner policy (mfa-totp D7): a session whose account must have a second
		// factor but has none may only enrol. Bearer tokens are never restricted.
		if sess != nil && sess.Restricted() && !allowedWhileRestricted(r) {
			writeError(w, http.StatusForbidden, "mfa_enrolment_required", "set up two-factor authentication to continue: the server owner requires it for this account")
			return
		}
		if s.demo != nil {
			// Sandbox activity keeps it alive (written at most once a minute).
			if err := s.demo.Touch(r.Context(), u.ID); err != nil {
				s.log.Warn("demo sandbox activity not recorded", "err", err)
			}
		}
		if sess != nil {
			ctx = httpx.WithSession(ctx, sess)
		}
		next(w, r.WithContext(ctx))
	})
}

func (s *Server) authenticate(r *http.Request) (*auth.User, bool, error) {
	u, _, viaCookie, err := s.authenticateSession(r)
	return u, viaCookie, err
}

// authenticateSession resolves the bearer token or session cookie. The session
// is nil for bearer tokens.
func (s *Server) authenticateSession(r *http.Request) (*auth.User, *auth.Session, bool, error) {
	u, sess, viaCookie, _, err := s.authenticateScoped(r)
	return u, sess, viaCookie, err
}

// authenticateScoped is authenticateSession plus the API token's id, name and
// scope (only auth.ScopeFull for sessions).
func (s *Server) authenticateScoped(r *http.Request) (*auth.User, *auth.Session, bool, auth.TokenInfo, error) {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		u, tok, err := s.auth.UserByTokenInfo(r.Context(), strings.TrimSpace(strings.TrimPrefix(h, "Bearer ")))
		if errors.Is(err, auth.ErrNotFound) {
			return nil, nil, false, auth.TokenInfo{}, nil
		}
		return u, nil, false, tok, err
	}
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return nil, nil, false, auth.TokenInfo{}, nil
	}
	sess, err := s.auth.LookupSession(r.Context(), c.Value)
	if errors.Is(err, auth.ErrNotFound) {
		return nil, nil, true, auth.TokenInfo{}, nil
	}
	if err != nil {
		return nil, nil, true, auth.TokenInfo{}, err
	}
	return sess.User, sess, true, auth.TokenInfo{Scope: auth.ScopeFull}, nil
}

// isWriteRequest reports whether a request may change state: every method but
// GET, HEAD and OPTIONS, and the sync route whatever its method (mcp-server D2).
// The quick-add parse POST changes nothing (extension-v2 D1).
func isWriteRequest(r *http.Request) bool {
	if isReadOnlyPost(r) {
		return false
	}
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return r.URL.Path == "/api/v1/sync"
	}
	return true
}

// cookieWriteAllowed is the cross-site check of a write authenticated by the
// session cookie (OpenSpec change cookie-writes-need-origin). With an Origin,
// originAllowed decides. Without one:
//   - Sec-Fetch-Site must be same-origin when it is sent at all: a browser that
//     says the request came from elsewhere is refused;
//   - with neither header, the request must declare a JSON body. Every browser
//     the app supports sends Origin on a write; one too old for that can only
//     send a cross-site write as a form or a navigation, which cannot carry
//     `Content-Type: application/json` (a page's script needs a CORS
//     preflight for that, which this server never grants). Non-browser
//     clients such as older `ot` releases send JSON and keep working, while
//     a form, multipart or bodiless write naming neither header is refused
//     instead of relying on SameSite=Lax alone.
//
// Bearer-token clients never reach this check.
func (s *Server) cookieWriteAllowed(r *http.Request) bool {
	if r.Header.Get("Origin") != "" {
		return s.originAllowed(r)
	}
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" {
		return site == "same-origin"
	}
	mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	return err == nil && mt == "application/json"
}

// originAllowed defends cookie-authenticated writes against cross-site requests.
// Browsers send Origin on every cross-site request and on same-site POSTs; a request
// without it comes from a non-browser client or a same-origin GET-like navigation.
func (s *Server) originAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	cfgOrigin := s.cfg.Origin()
	if cfgOrigin != "" && strings.EqualFold(origin, cfgOrigin) {
		return true
	}
	host := requestHost(r)
	// With a base URL the request must also be addressed to its host, so a page
	// under another name that resolves here (DNS rebinding) is cross-site
	// (trusted-client-identity).
	if cfgOrigin != "" && !strings.EqualFold(host, s.cfg.BaseURL.Host) {
		// Same-host pages under another name are refused; say so in the log, as
		// it is usually a stale OPENTODO_BASE_URL after a domain move (#125).
		if strings.EqualFold(origin, "http://"+host) || strings.EqualFold(origin, "https://"+host) {
			s.wrongHosts.warn(s.log, host, s.cfg.BaseURL.String())
		}
		return false
	}
	return strings.EqualFold(origin, "http://"+host) || strings.EqualFold(origin, "https://"+host)
}

// hostWarnings logs once per host that a page opened under it was refused
// because OPENTODO_BASE_URL names another host. At most maxWrongHosts hosts are
// remembered, so made-up Host headers cannot grow it or flood the log.
type hostWarnings struct {
	mu   sync.Mutex
	seen map[string]bool
}

const maxWrongHosts = 32

func (h *hostWarnings) warn(log *slog.Logger, host, baseURL string) {
	h.mu.Lock()
	host = strings.ToLower(host)
	if h.seen[host] || len(h.seen) >= maxWrongHosts {
		h.mu.Unlock()
		return
	}
	if h.seen == nil {
		h.seen = map[string]bool{}
	}
	h.seen[host] = true
	h.mu.Unlock()
	if log == nil {
		log = slog.Default()
	}
	log.Warn("refused a browser request for a host that is not OPENTODO_BASE_URL's: open the app at the base URL, or set OPENTODO_BASE_URL to the address people use",
		"host", host, "base_url", baseURL)
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		// Geolocation for the app's own pages only: "Use my location" in the
		// location editor (task-locations D8).
		h.Set("Permissions-Policy", "camera=(), geolocation=(self)")
		if s.cfg.SecureCookies() {
			// The base URL is https: browsers keep to it for a year
			// (trusted-client-identity); no includeSubDomains, no preload.
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("Content-Security-Policy", s.contentSecurityPolicy(r.Context()))
		}
		next.ServeHTTP(w, r)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// Unwrap lets http.ResponseController reach Flush and the deadline setters of
// the underlying writer (needed by the event stream).
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		s.warnUnforwarded(r)
		sw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(sw, r)
		if strings.HasPrefix(r.URL.Path, "/api/") || sw.status >= 400 {
			s.log.Debug("http", "method", r.Method, "path", redactPath(r.URL.Path), "status", sw.status, "ms", time.Since(start).Milliseconds())
		}
	})
}
