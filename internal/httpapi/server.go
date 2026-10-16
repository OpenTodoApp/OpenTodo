// Package httpapi exposes the JSON API and wires authentication, the op log and
// the embedded web app into one http.Handler.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/agenttools"
	"github.com/pixari/opentodo/internal/assistant"
	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/backup"
	"github.com/pixari/opentodo/internal/blobs"
	"github.com/pixari/opentodo/internal/calfeed"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/demo"
	"github.com/pixari/opentodo/internal/email"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/importer"
	"github.com/pixari/opentodo/internal/mail"
	"github.com/pixari/opentodo/internal/mcp"
	"github.com/pixari/opentodo/internal/notify"
	"github.com/pixari/opentodo/internal/oidc"
	"github.com/pixari/opentodo/internal/push"
	"github.com/pixari/opentodo/internal/settings"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/webhook"
)

const sessionCookie = "opentodo_session"

// Server holds the dependencies of the HTTP layer.
type Server struct {
	cfg     config.Config
	auth    *auth.Service
	audit   *audit.Recorder
	sync    *opsync.Service
	web     http.Handler
	log     *slog.Logger
	version string
	// blobs stores attachment files (attachments D2); nil without a data directory.
	blobs *blobs.Store
	// attachmentLimiter caps uploads per account (120/hour, attachments D5).
	attachmentLimiter *rateLimiter
	// limiter guards the unauthenticated auth routes per client IP (10/min).
	limiter *rateLimiter
	// passkeyOptions limits anonymous passkey challenge requests separately, so
	// the sign-in screen's autofill request does not use up password attempts.
	passkeyOptions *rateLimiter
	// inviteLimiter caps invitation creation per account (20/hour).
	inviteLimiter *rateLimiter
	// projectInviteLimiter caps project invite link creation per account
	// (20/hour; OpenSpec `project-invite-links`), see projectinvites.go.
	projectInviteLimiter *rateLimiter
	// mfaLimiter guards the second sign-in step and reauthLimiter
	// re-authentication, per client address (10/min each; OpenSpec `mfa-totp`).
	mfaLimiter    *rateLimiter
	reauthLimiter *rateLimiter
	// adminLimiter caps mutating user-administration requests per acting
	// account (60/hour) and passwordLimiter self-service password changes per
	// account (10/hour) (OpenSpec `user-management` D9).
	adminLimiter    *rateLimiter
	passwordLimiter *rateLimiter
	// pushTestLimiter caps test pushes per account (5 per 10 minutes; OpenSpec
	// `push-test-delivery` D3), see push.go.
	pushTestLimiter *rateLimiter
	// mail sends outgoing email (OpenSpec `outgoing-email`); nil on a demo
	// instance or when not wired, which means "not configured".
	mail *mail.Service
	// smtpTestLimiter caps test messages per account (5 per 10 minutes).
	smtpTestLimiter *rateLimiter
	// public holds the public-link limiters (OpenSpec `public-links`).
	public publicLimiters
	// importer previews, runs and undoes file imports (OpenSpec `data-import`).
	importer *importer.Service
	// hooks manages outbound webhooks; nil when not wired (routes answer 503).
	hooks *webhook.Service

	clockMu sync.Mutex
	lastTS  int64

	// backups is nil when the server runs without the backup service (tests).
	backups *backup.Service
	// push is nil when web push is not wired (tests); see push.go.
	push *push.Service
	// tzOffsets caches each user's last reported zone offset (minutes east of UTC).
	tzOffsets sync.Map
	// inbox serves in-app notifications (OpenSpec `task-assignment`).
	inbox *notify.InApp
	// oidc is single sign-on (OpenSpec `oidc-login`); oidcLimiter guards its
	// anonymous start and callback routes per client address (20/min).
	oidc        *oidc.Service
	oidcLimiter *rateLimiter
	// caldav caches the CalDAV toggle and davLimiter counts failed Basic
	// authentications per client address (10/min; OpenSpec `caldav`).
	caldav caldavState
	// Calendar feeds (calendar-feeds): the switch cache, the fetch worker and limiters.
	calFeeds        caldavState
	calWorker       *calfeed.Worker
	calFetchLimiter *rateLimiter
	feedLimiter     *rateLimiter
	davLimiter      *rateLimiter
	// mcpSettings is the owner's AI assistants toggle and mcp the read-only MCP
	// server behind /mcp (OpenSpec `mcp-server`); see mcp.go.
	mcpSettings *mcp.Settings
	mcp         *mcp.Server
	// agentTools is the AI agent tool registry behind /mcp and agentAccess the
	// users' "Allow AI assistants to make changes" switches (mcp-write-tools).
	agentTools  *agenttools.Registry
	agentAccess *agenttools.Access
	// email is email capture (OpenSpec `email-to-task`); emailLimiter caps
	// inbox changes and rotations per account (30/hour).
	email        *email.Service
	emailLimiter *rateLimiter
	// demo is set on a demo instance (OpenSpec `demo-mode`); see demo.go.
	demo *demo.Service
	// assistant is the in-app assistant (OpenSpec `in-app-assistant`); see
	// assistant.go. assistantSetup lets tests adjust it once built.
	assistant      *assistant.Service
	assistantSetup func(*assistant.Service)
	// assistantTestLimiter limits members' own connection tests (assistant-member-provider).
	assistantTestLimiter *rateLimiter
	// idemSalt makes Idempotency-Key ids unguessable (agent-ready-cli D5);
	// see idempotency.go.
	idemSalt string
}

// WithBackups (an Option, see webhooks.go) enables the owner-only /api/v1/backups routes.
func WithBackups(b *backup.Service) Option { return func(s *Server) { s.backups = b } }

// opTS stamps REST-originated ops. They all carry device "server", so two writes
// to one field within the same millisecond would tie under the winner rule and the
// second would be silently dropped; like the client HLC, issue strictly increasing
// timestamps instead.
func (s *Server) opTS() int64 {
	s.clockMu.Lock()
	defer s.clockMu.Unlock()
	s.lastTS = max(time.Now().UnixMilli(), s.lastTS+1)
	return s.lastTS
}

// New builds the router. web may be nil when only the API is wanted (tests).
func New(cfg config.Config, authSvc *auth.Service, syncSvc *opsync.Service, web http.Handler, log *slog.Logger, version string, opts ...Option) http.Handler {
	s := &Server{cfg: cfg, auth: authSvc, audit: authSvc.Audit(), sync: syncSvc, web: web, log: log, version: version,
		limiter: newRateLimiter(10, time.Minute), inviteLimiter: newRateLimiter(20, time.Hour),
		passkeyOptions: newRateLimiter(10, time.Minute),
		mfaLimiter:     newRateLimiter(10, time.Minute), reauthLimiter: newRateLimiter(10, time.Minute),
		adminLimiter: newRateLimiter(60, time.Hour), passwordLimiter: newRateLimiter(10, time.Hour),
		oidcLimiter: newRateLimiter(20, time.Minute), davLimiter: newRateLimiter(10, time.Minute),
		emailLimiter: newRateLimiter(30, time.Hour),
		importer:     importer.New(syncSvc.DB(), syncSvc, log)}
	// Imports: unpacked archives are bounded by the upload limit, and an uploaded
	// database is read from a private copy under the data directory (OpenSpec
	// change named-importers).
	importTmp := ""
	if cfg.DataDir != "" {
		importTmp = filepath.Join(cfg.DataDir, "tmp")
		if err := os.MkdirAll(importTmp, 0o700); err != nil {
			log.Warn("import: temporary directory", "err", err)
			importTmp = ""
		}
	}
	s.importer.SetLimits(cfg.ImportMaxBytes(), importTmp)
	for _, o := range opts {
		o(s)
	}
	setTrustedProxies(cfg.TrustedProxies, cfg.TrustCloudflare)
	if err := s.loadIdempotencySalt(context.Background()); err != nil {
		// Without a stored salt keyed ids still derive per user; they are only
		// guessable by someone who knows the user id and the key.
		log.Error("idempotency salt unavailable", "err", err)
	}
	if s.demo != nil {
		// Sandbox writes are bounded: field sizes and the write budget (demo-sandboxes D3).
		syncSvc.SetWriteGuard(s.demo.Guard())
	}
	if s.hooks != nil {
		// Imports reach webhooks as one summary per job (harden-server-edges).
		s.importer.SetSummaryObserver(s.hooks.ObserveImport)
	}
	if s.oidc == nil {
		s.oidc = oidc.New(settings.New(syncSvc.DB()), cfg.DataDir, oidc.Options{Env: oidc.Env(cfg.OIDC)})
	}
	// SSO-only mode refuses local sign-in for members (oidc-login D6).
	authSvc.SetSSOOnly(s.oidc.SSOOnly)
	if s.email == nil {
		// Disabled unless cfg.Email is set; only cmd/opentodo starts the poller.
		s.email = email.New(syncSvc.DB(), syncSvc, cfg.Email, email.Options{Log: log, Audit: authSvc.Audit()})
	}
	if s.inbox == nil {
		s.inbox = notify.NewInApp(syncSvc.DB(), log)
		syncSvc.AddSink(s.inbox)
	}
	// Passkeys need a relying party; it is derived from the base URL so the
	// 409 guard in the handlers and the service always agree.
	if cfg.PasskeysAvailable() && !authSvc.PasskeysAvailable() {
		authSvc.ConfigurePasskeys(cfg.RPID(), cfg.Origin())
	}
	// Deleting an account removes its synced data in the same transaction
	// (user-management D4; the project-sharing hook lives in the sync package).
	authSvc.SetBeforeDelete(opsync.DeleteAccountData)
	mux := http.NewServeMux()
	s.registerAttachmentRoutes(mux)

	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/v1/auth/status", s.handleAuthStatus)
	mux.HandleFunc("POST /api/v1/auth/register", s.handleRegister)
	mux.HandleFunc("POST /api/v1/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/v1/auth/logout", s.handleLogout)
	// Passwordless sign-in: anonymous by design. Finishing shares the login
	// limiter; fetching a challenge has its own per-address limiter.
	mux.HandleFunc("POST /api/v1/auth/passkey/options", s.handlePasskeyLoginOptions)
	mux.HandleFunc("POST /api/v1/auth/passkey", s.handlePasskeyLogin)
	// Second factor (OpenSpec `mfa-totp`): the second sign-in step is anonymous
	// (it carries the challenge), everything else requires a session or token.
	s.registerMFARoutes(mux)
	// Single sign-on (OpenSpec `oidc-login`): start and callback are part of the
	// sign-in flow (anonymous, rate limited); settings and identities require auth.
	s.registerOIDCRoutes(mux)
	s.registerMailRoutes(mux)
	// Weekly email digest settings (stats-and-review).
	s.registerDigestRoutes(mux)
	s.registerSignupRoutes(mux)
	s.registerPublicLinkRoutes(mux)

	mux.Handle("GET /api/v1/me", s.requireAuth(s.handleMe))
	mux.Handle("GET /api/v1/tokens", s.requireAuth(s.handleListTokens))
	mux.Handle("POST /api/v1/tokens", s.requireAuth(s.requireFresh(s.handleCreateToken)))
	mux.Handle("DELETE /api/v1/tokens/{id}", s.requireAuth(s.handleDeleteToken))
	mux.Handle("POST /api/v1/passkeys/register/options", s.requireAuth(s.handlePasskeyRegisterOptions))
	mux.Handle("POST /api/v1/passkeys/register", s.requireAuth(s.handlePasskeyRegister))
	mux.Handle("GET /api/v1/passkeys", s.requireAuth(s.handleListPasskeys))
	mux.Handle("PATCH /api/v1/passkeys/{id}", s.requireAuth(s.handleRenamePasskey))
	mux.Handle("DELETE /api/v1/passkeys/{id}", s.requireAuth(s.handleDeletePasskey))
	// Invitations: owner-only management plus the one public preview route the
	// spec defines (the invitee has no account yet). Both must be registered before
	// the generic {collection} routes so the mux prefers these literal patterns.
	mux.Handle("GET /api/v1/invitations", s.requireAuth(s.handleListInvitations))
	mux.Handle("POST /api/v1/invitations", s.requireAuth(s.requireFresh(s.handleCreateInvitation)))
	mux.Handle("DELETE /api/v1/invitations/{id}", s.requireAuth(s.handleRevokeInvitation))
	mux.HandleFunc("GET /api/v1/invitations/{token}", s.handlePreviewInvitation)
	// User administration (OpenSpec `user-management`): literal patterns, so they
	// win over the {collection} routes below.
	s.registerUserRoutes(mux)
	// Audit log: owner-only reads, export and settings; personal activity for
	// everyone. Literal patterns, so they win over the {collection} routes below.
	mux.Handle("GET /api/v1/audit", s.requireAuth(s.handleAuditList))
	mux.Handle("GET /api/v1/audit/export", s.requireAuth(s.handleAuditExport))
	mux.Handle("GET /api/v1/settings/audit", s.requireAuth(s.handleGetAuditSettings))
	mux.Handle("PUT /api/v1/settings/audit", s.requireAuth(s.handlePutAuditSettings))
	mux.Handle("GET /api/v1/me/activity", s.requireAuth(s.handleMyActivity))
	// Webhooks (OpenSpec `webhooks`): /api/v1/webhooks* and /api/v1/settings/webhooks,
	// all behind requireAuth; literal patterns win over the {collection} routes below.
	s.registerWebhookRoutes(mux)
	// Backups: owner only (OpenSpec `backups`); literal patterns win over {collection}.
	mux.Handle("GET /api/v1/backups", s.requireAuth(s.handleBackupStatus))
	mux.Handle("GET /api/v1/backups/settings", s.requireAuth(s.handleGetBackupSettings))
	mux.Handle("PUT /api/v1/backups/settings", s.requireAuth(s.handlePutBackupSettings))
	mux.Handle("POST /api/v1/backups/run", s.requireAuth(s.handleBackupRun))
	mux.Handle("POST /api/v1/backups/test", s.requireAuth(s.handleBackupTest))
	// Web restore (backup-restore-web): owner only; confirm and safety-copy
	// delete also need a fresh session and refuse API tokens (in the handlers).
	mux.Handle("GET /api/v1/backups/archives", s.requireAuth(s.handleBackupArchives))
	mux.Handle("GET /api/v1/backups/restore", s.requireAuth(s.handleRestoreState))
	mux.Handle("POST /api/v1/backups/restore", s.requireAuth(s.handleRestoreConfirm))
	mux.Handle("POST /api/v1/backups/restore/uploads", s.requireAuth(s.handleRestoreUpload))
	mux.Handle("POST /api/v1/backups/restore/prepare", s.requireAuth(s.handleRestorePrepare))
	mux.Handle("DELETE /api/v1/backups/restore/safety-copies/{name}", s.requireAuth(s.handleDeleteSafetyCopy))
	mux.Handle("DELETE /api/v1/backups/restore/{id}", s.requireAuth(s.handleRestoreCancel))
	// Project sharing (OpenSpec `project-sharing`): literal patterns win over {collection}.
	s.registerSharingRoutes(mux)
	// Project invite links (OpenSpec `project-invite-links`): literal patterns win over {collection}.
	s.registerProjectInviteRoutes(mux)
	// Web push (OpenSpec `reminders`): registered only while push is enabled.
	s.registerPushRoutes(mux)
	// Notifications (OpenSpec `task-assignment`): literal patterns win over {collection}.
	s.registerNotificationRoutes(mux)
	// Trash and history (OpenSpec `trash-and-history`): literal patterns win over {collection}.
	s.registerTrashRoutes(mux)
	// CalDAV (OpenSpec `caldav`): app passwords, the owner toggle and /dav/.
	s.seedCaldav(context.Background())
	s.registerCaldavRoutes(mux)
	s.registerCalendarFeedRoutes(mux)
	// Comments and activity (OpenSpec `comments-and-activity`): literal patterns win over {collection}.
	s.registerCommentRoutes(mux)
	// End-to-end encryption (OpenSpec `e2ee`): wrapped key record and history purge.
	s.registerEncryptionRoutes(mux)
	// Read-only MCP endpoint and its owner toggle (OpenSpec `mcp-server`).
	s.registerMCPRoutes(mux)
	// In-app assistant (OpenSpec `in-app-assistant`): settings, consent, usage
	// and the turn route over the same tool registry.
	s.registerAssistantRoutes(mux)
	// Email to task (OpenSpec `email-to-task`): literal patterns win over {collection}.
	s.registerEmailRoutes(mux)
	// Demo sandboxes (OpenSpec `demo-sandboxes`): registered on a demo instance only.
	s.registerDemoRoutes(mux)
	mux.Handle("POST /api/v1/sync", s.requireAuth(s.handleSync))
	mux.Handle("GET /api/v1/sync/events", s.requireAuth(s.handleEvents))
	mux.Handle("GET /api/v1/export", s.requireAuth(s.handleExport))
	// Import (OpenSpec `data-import`): literal patterns win over the {collection} routes.
	mux.Handle("POST /api/v1/import/preview", s.requireAuth(s.handleImportPreview))
	mux.Handle("POST /api/v1/import", s.requireAuth(s.handleImportStart))
	mux.Handle("GET /api/v1/import/jobs", s.requireAuth(s.handleImportJobs))
	mux.Handle("GET /api/v1/import/jobs/{id}", s.requireAuth(s.handleImportJob))
	mux.Handle("POST /api/v1/import/jobs/{id}/undo", s.requireAuth(s.handleImportUndo))
	mux.Handle("GET /api/v1/{collection}", s.requireAuth(s.handleList))
	mux.Handle("POST /api/v1/{collection}", s.requireAuth(s.handleCreate))
	mux.Handle("GET /api/v1/{collection}/{id}", s.requireAuth(s.handleGet))
	mux.Handle("PATCH /api/v1/{collection}/{id}", s.requireAuth(s.handlePatch))
	mux.Handle("DELETE /api/v1/{collection}/{id}", s.requireAuth(s.handleDelete))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "unknown API route")
	})
	if web != nil {
		// The share sheet POSTs here when the service worker is not active yet.
		mux.HandleFunc("POST /share", s.handleSharePost)
		mux.Handle("/", web)
		// A public list page (public-links D7): no indexing and no referrer, so
		// the secret in its address never leaks to a site it links to.
		mux.Handle("GET /public/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Robots-Tag", "noindex, nofollow")
			w.Header().Set("Referrer-Policy", "no-referrer")
			web.ServeHTTP(w, r)
		}))
	}
	return s.securityHeaders(s.logRequests(auditContext(s.demoGuard(mux))))
}

// auditContext hands the client address and user agent to the audit recorder.
// The address is stored only when the owner enabled address logging.
func auditContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(audit.WithRequest(r.Context(), clientIP(r), r.UserAgent())))
	})
}

// ---- middleware ----

type ctxKey int

const (
	userKey ctxKey = 1
	// sessionKey holds the *auth.Session of cookie-authenticated requests; it is
	// absent for bearer tokens, which step-up and policy never touch.
	sessionKey ctxKey = 2
	// tokenKey holds the auth.TokenInfo of the request: the API token's id,
	// name and scope, or only scope full for a session (agent-ready-cli D7).
	tokenKey ctxKey = 3
)

func tokenFrom(ctx context.Context) auth.TokenInfo {
	t, _ := ctx.Value(tokenKey).(auth.TokenInfo)
	return t
}

func userFrom(ctx context.Context) *auth.User {
	u, _ := ctx.Value(userKey).(*auth.User)
	return u
}

func sessionFrom(ctx context.Context) *auth.Session {
	sess, _ := ctx.Value(sessionKey).(*auth.Session)
	return sess
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
		ctx := context.WithValue(r.Context(), userKey, u)
		ctx = context.WithValue(ctx, tokenKey, tok)
		// Only sessions and full tokens reach a handler that writes: read tokens
		// (mcp-server D2) and agent tokens (mcp-write-tools D2) are refused, and
		// so is any scope this binary does not know (fail closed). The one
		// exception is the fixed list of agent content routes (agent-ready-cli
		// D8): an agent token's write there never reaches the regular handler but
		// runs through the agent tool registry, with its switches, limits and
		// audit (agent_rest.go).
		if scope != auth.ScopeFull && isWriteRequest(r) {
			if scope == auth.ScopeAgent && agentRoute(r) != "" {
				s.handleAgentWrite(w, r.WithContext(ctx), u, tok)
				return
			}
			msg := "this API token is read-only"
			if scope == auth.ScopeAgent {
				msg = "this API token is for AI assistants: it can create and edit tasks, projects, labels and comments, and nothing else (see docs/api.md#agent-tokens)"
			}
			writeError(w, http.StatusForbidden, "insufficient_scope", msg)
			return
		}
		if viaCookie && r.Method != http.MethodGet && r.Method != http.MethodHead && !s.originAllowed(r) {
			writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
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
			ctx = context.WithValue(ctx, sessionKey, sess)
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
func isWriteRequest(r *http.Request) bool {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return r.URL.Path == "/api/v1/sync"
	}
	return true
}

// originAllowed defends cookie-authenticated writes against cross-site requests.
// Browsers send Origin on every cross-site request and on same-site POSTs; a request
// without it comes from a non-browser client or a same-origin GET-like navigation.
func (s *Server) originAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	if cfgOrigin := s.cfg.Origin(); cfgOrigin != "" && strings.EqualFold(origin, cfgOrigin) {
		return true
	}
	host := r.Host
	if fwd := r.Header.Get("X-Forwarded-Host"); fwd != "" {
		host = strings.TrimSpace(strings.Split(fwd, ",")[0])
	}
	return strings.EqualFold(origin, "http://"+host) || strings.EqualFold(origin, "https://"+host)
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), geolocation=()")
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
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
		sw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(sw, r)
		if strings.HasPrefix(r.URL.Path, "/api/") || sw.status >= 400 {
			s.log.Debug("http", "method", r.Method, "path", redactPath(r.URL.Path), "status", sw.status, "ms", time.Since(start).Milliseconds())
		}
	})
}

// ---- handlers: health & auth ----

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if _, err := s.auth.UserCount(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unhealthy", "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "version": s.version})
}

func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	allowed, err := s.auth.SignupAllowed(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	count, _ := s.auth.UserCount(r.Context())
	u, sess, _, err := s.authenticateSession(r)
	if err != nil {
		s.internal(w, err)
		return
	}
	out := map[string]any{
		"setupRequired": count == 0,
		// A configured OPENTODO_SETUP_TOKEN guards the first account (OpenSpec
		// change owner-bootstrap); false once an owner exists.
		"setupTokenRequired": count == 0 && s.auth.SetupTokenRequired(),
		"signupAllowed":      allowed,
		"authenticated":      u != nil,
		"user":               u,
		"version":            s.version,
		"passkeysAvailable":  s.cfg.PasskeysAvailable(),
		// The host passkeys are bound to (OPENTODO_BASE_URL's), so a page opened at
		// another host can say so; public information, empty without a base URL.
		"passkeyDomain": s.cfg.RPID(),
		"oidc":          s.oidcStatus(r.Context()),
		"outgoingEmail": map[string]bool{"enabled": s.mailEnabled(r.Context())},
	}
	if s.demo != nil {
		// Demo instance (OpenSpec `demo-sandboxes`): a sandbox-creation token, the
		// sandbox lifetimes and the next reset; no credentials.
		out["demo"] = s.demo.Info()
	}
	if u != nil {
		st, err := s.auth.MFAStatusFor(r.Context(), u, sess != nil)
		if err != nil {
			s.internal(w, err)
			return
		}
		out["mfa"] = st
		// The web app reads its profile here (OpenSpec `e2ee`, design D5/D9).
		out["encryption"] = s.encryptionStatus(r.Context(), u.ID)
		out["minClientVersion"] = MinClientVersion
	}
	writeJSON(w, http.StatusOK, out)
}

type credentials struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
	// Invitation is an optional invitation secret that admits one member while
	// sign-up is closed (OpenSpec `invitations`).
	Invitation string `json:"invitation"`
	// ProjectInvite is an optional project invite link secret: the new account
	// joins that project (OpenSpec `project-invite-links`).
	ProjectInvite string `json:"projectInvite"`
	// SetupToken must accompany the first registration when OPENTODO_SETUP_TOKEN
	// is set (OpenSpec `owner-bootstrap`); ignored afterwards.
	SetupToken string `json:"setupToken"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	if !s.originAllowed(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
		return
	}
	var c credentials
	if err := readJSON(r, &c); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	// In SSO-only mode new accounts come from the provider, never a password
	// form (the first account is the owner and can always be created).
	if n, err := s.auth.UserCount(r.Context()); err == nil && n > 0 && s.auth.SSOOnly(r.Context()) {
		writeError(w, http.StatusForbidden, "sso_required", auth.ErrSSORequired.Error())
		return
	}
	if c.ProjectInvite != "" {
		if c.Invitation != "" {
			writeError(w, http.StatusBadRequest, "invalid_input", "send either invitation or projectInvite, not both")
			return
		}
		s.registerWithProjectInvite(w, r, c)
		return
	}
	// Open sign-up on a server that can send mail verifies the address first
	// (OpenSpec `outgoing-email` D4); invitations and the first account never do.
	if c.Invitation == "" && s.auth.OpenSignup() && s.mailEnabled(r.Context()) {
		if n, err := s.auth.UserCount(r.Context()); err == nil && n > 0 {
			s.registerWithVerification(w, r, c)
			return
		}
	}
	u, err := s.auth.RegisterWithSetupToken(r.Context(), c.Email, c.Name, c.Password, c.Invitation, c.SetupToken)
	switch {
	case errors.Is(err, auth.ErrSetupTokenInvalid):
		writeError(w, http.StatusForbidden, "setup_token_invalid", err.Error())
		return
	case errors.Is(err, auth.ErrSignupClosed):
		writeError(w, http.StatusForbidden, "signup_closed", err.Error())
		return
	case errors.Is(err, auth.ErrInvitationInvalid):
		writeError(w, http.StatusNotFound, "invitation_invalid", err.Error())
		return
	case errors.Is(err, auth.ErrInvitationEmailMismatch):
		writeError(w, http.StatusForbidden, "invitation_email_mismatch", err.Error())
		return
	case errors.Is(err, auth.ErrEmailTaken):
		writeError(w, http.StatusConflict, "email_taken", err.Error())
		return
	case errors.Is(err, auth.ErrInvalidEmail), errors.Is(err, auth.ErrWeakPassword):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	if s.startSession(w, r, u, http.StatusCreated, false) {
		s.audit.Record(r.Context(), audit.LoginSucceeded(u.ID, u.Email, "register"))
	}
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if allowed, first := s.limiter.hit(clientIP(r)); !allowed {
		// One event per window and address once limiting kicks in, instead of one
		// per refused attempt, so credential stuffing cannot flood the log.
		if first {
			s.audit.Record(r.Context(), audit.LoginFailed("", "", audit.ReasonRateLimited))
		}
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	if !s.originAllowed(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
		return
	}
	var c credentials
	if err := readJSON(r, &c); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	u, err := s.auth.Authenticate(r.Context(), c.Email, c.Password)
	if errors.Is(err, auth.ErrInvalidCredentials) {
		var f *auth.LoginFailure
		if errors.As(err, &f) {
			s.audit.Record(r.Context(), audit.LoginFailed(f.UserID, f.Email, f.Reason))
		}
		writeError(w, http.StatusUnauthorized, "invalid_credentials", err.Error())
		return
	}
	if errors.Is(err, auth.ErrAccountDeactivated) {
		var d *auth.DeactivatedLogin
		if errors.As(err, &d) {
			s.audit.Record(r.Context(), audit.LoginFailed(d.UserID, d.Email, audit.ReasonDeactivated))
		}
		writeError(w, http.StatusForbidden, "account_deactivated", "this account has been deactivated; ask the server owner or an admin")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	// SSO-only mode: members must use the provider (oidc-login D6).
	if s.ssoRequired(w, r, u) {
		return
	}
	// An enrolled account needs its second factor, unless this browser was
	// remembered (mfa-totp D3, D6).
	if done := s.secondStep(w, r, u, "password"); done {
		return
	}
	if s.startSession(w, r, u, http.StatusOK, false) {
		s.audit.Record(r.Context(), audit.LoginSucceeded(u.ID, u.Email, "password"))
	}
}

// startSession issues the session cookie and answers with the user. mfa marks
// the second factor as satisfied for the session. It reports whether the
// session was created.
func (s *Server) startSession(w http.ResponseWriter, r *http.Request, u *auth.User, status int, mfa bool) bool {
	if _, ok := s.issueSession(w, r, u, mfa); !ok {
		return false
	}
	writeJSON(w, status, map[string]any{"user": u})
	return true
}

// issueSession creates the session and sets its cookie without writing a body
// (the provider callback redirects instead). It returns the cookie value.
func (s *Server) issueSession(w http.ResponseWriter, r *http.Request, u *auth.User, mfa bool) (string, bool) {
	secret, exp, err := s.auth.CreateSessionMFA(r.Context(), u.ID, r.UserAgent(), mfa)
	if errors.Is(err, auth.ErrAccountDeactivated) {
		writeError(w, http.StatusForbidden, "account_deactivated", "this account has been deactivated; ask the server owner or an admin")
		return "", false
	}
	if err != nil {
		s.internal(w, err)
		return "", false
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: secret, Path: "/", Expires: exp,
		HttpOnly: true, Secure: s.cfg.SecureCookies(), SameSite: http.SameSiteLaxMode,
	})
	return secret, true
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	redirect := ""
	if c, err := r.Cookie(sessionCookie); err == nil {
		u, lookupErr := s.auth.UserBySession(r.Context(), c.Value)
		// The identity-token hint is read before the session (and the hint with
		// it) is deleted; only sessions that started through the provider have one.
		idToken, viaProvider, _ := s.auth.SessionIDToken(r.Context(), c.Value)
		if err := s.auth.DeleteSession(r.Context(), c.Value); err == nil && lookupErr == nil {
			s.audit.Record(r.Context(), audit.Logout(u.ID))
			if viaProvider {
				redirect = s.providerLogoutURL(r, idToken)
			}
		}
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: s.cfg.SecureCookies(), SameSite: http.SameSiteLaxMode})
	// Provider sign-out (oidc-login D7): the local session is already gone; the
	// client follows the redirect to the provider's end-session endpoint.
	if redirect != "" {
		writeJSON(w, http.StatusOK, map[string]any{"redirect": redirect})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	st, err := s.auth.MFAStatusFor(r.Context(), u, sessionFrom(r.Context()) != nil)
	if err != nil {
		s.internal(w, err)
		return
	}
	authInfo, err := s.credentialInfo(r)
	if err != nil {
		s.internal(w, err)
		return
	}
	// encryption and minClientVersion: OpenSpec `e2ee` (design D8, D9); auth:
	// `agent-ready-cli` (design D7).
	out := map[string]any{"user": u, "mfa": st,
		"encryption": s.encryptionStatus(r.Context(), u.ID), "minClientVersion": MinClientVersion, "auth": authInfo}
	// Attachment limits and this account's usage (attachments D5), for the device's checks.
	if info, err := s.attachmentInfo(r.Context(), u.ID); err == nil {
		out["attachments"] = info
	}
	// Configuration problems the server started despite (trusted-proxies-lenient):
	// for the owner's own session only, never for members, admins or API tokens.
	if u.Role == auth.RoleOwner && tokenFrom(r.Context()).ID == "" {
		warnings := s.cfg.Warnings
		if warnings == nil {
			warnings = []config.Warning{}
		}
		out["config_warnings"] = warnings
	}
	writeJSON(w, http.StatusOK, out)
}

// credentialInfo describes how the request authenticated (agent-ready-cli D7):
// method session or token, the scope and, for tokens, the token's id and name,
// never its secret. For an agent token it adds whether writes are allowed right
// now (both switches), since the switch route itself refuses agent tokens.
func (s *Server) credentialInfo(r *http.Request) (map[string]any, error) {
	tok := tokenFrom(r.Context())
	if tok.ID == "" {
		return map[string]any{"method": "session", "scope": auth.ScopeFull}, nil
	}
	out := map[string]any{"method": "token", "scope": tok.Scope, "token_id": tok.ID, "token_name": tok.Name}
	if tok.Scope == auth.ScopeAgent && s.agentAccess != nil {
		c, err := s.agentCaller(r.Context(), userFrom(r.Context()), tok)
		if err != nil {
			return nil, err
		}
		out["writes_allowed"] = c.CanWrite()
		if d := c.WriteDenial(); d != "" {
			out["writes_denied"] = d
		}
	}
	return out, nil
}

func (s *Server) handleListTokens(w http.ResponseWriter, r *http.Request) {
	list, err := s.auth.ListTokens(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tokens": list})
}

func (s *Server) handleCreateToken(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name  string `json:"name"`
		Scope string `json:"scope"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	t, plain, err := s.auth.CreateTokenScoped(r.Context(), userFrom(r.Context()).ID, in.Name, in.Scope)
	if errors.Is(err, auth.ErrInvalidScope) {
		writeError(w, http.StatusBadRequest, "invalid_input", "scope: must be full, read or agent")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": t, "secret": plain})
}

func (s *Server) handleDeleteToken(w http.ResponseWriter, r *http.Request) {
	err := s.auth.DeleteToken(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "token not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- handlers: invitations ----

// requireInviter answers 403 unless the signed-in user may manage invitations.
func (s *Server) requireInviter(w http.ResponseWriter, r *http.Request) *auth.User {
	u := userFrom(r.Context())
	if !s.auth.CanInvite(u) {
		writeError(w, http.StatusForbidden, "forbidden", "only the owner and admins can manage invitations")
		return nil
	}
	return u
}

func (s *Server) handleListInvitations(w http.ResponseWriter, r *http.Request) {
	if s.requireInviter(w, r) == nil {
		return
	}
	list, err := s.auth.ListInvitations(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"invitations": list})
}

func (s *Server) handleCreateInvitation(w http.ResponseWriter, r *http.Request) {
	u := s.requireInviter(w, r)
	if u == nil {
		return
	}
	if !s.inviteLimiter.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many invitations created, try again later")
		return
	}
	var in struct {
		Email          string   `json:"email"`
		ExpiresInHours *float64 `json:"expiresInHours"`
		Send           bool     `json:"send"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	msg, ok := s.inviteMessage(w, r, in.Send, in.Email, mail.KindInvitation, u, "")
	if !ok {
		return
	}
	ttl := auth.DefaultInvitationTTL
	if in.ExpiresInHours != nil {
		h := *in.ExpiresInHours
		if h != float64(int64(h)) || h < 1 || h > 720 {
			writeError(w, http.StatusBadRequest, "invalid_input", auth.ErrInvalidExpiry.Error())
			return
		}
		ttl = time.Duration(h) * time.Hour
	}
	inv, secret, err := s.auth.CreateInvitation(r.Context(), u, in.Email, ttl)
	switch {
	case errors.Is(err, auth.ErrInvalidEmail):
		writeError(w, http.StatusBadRequest, "invalid_input", "email: "+err.Error())
		return
	case errors.Is(err, auth.ErrInvalidExpiry):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	link := s.publicOrigin(r) + "/invite/" + secret
	out := map[string]any{"invitation": inv, "link": link}
	if in.Send {
		msg.Vars.Link, msg.Vars.Expiry = link, ttl
		if err := s.mail.Send(r.Context(), msg); err != nil {
			if rerr := s.auth.RevokeInvitation(context.WithoutCancel(r.Context()), u.ID, inv.ID); rerr != nil {
				s.log.Error("revoke unsent invitation", "err", rerr)
			}
			s.mailSendError(w, err)
			return
		}
		out["sent"] = true
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) handleRevokeInvitation(w http.ResponseWriter, r *http.Request) {
	u := s.requireInviter(w, r)
	if u == nil {
		return
	}
	err := s.auth.RevokeInvitation(r.Context(), u.ID, r.PathValue("id"))
	switch {
	case errors.Is(err, auth.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "invitation not found")
		return
	case errors.Is(err, auth.ErrInvitationSpent):
		writeError(w, http.StatusConflict, "invitation_spent", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handlePreviewInvitation is public: the invitee has no account yet. It shares
// the sign-in limiter so token guessing is as expensive as password guessing,
// and every failure is the same 404.
func (s *Server) handlePreviewInvitation(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	p, err := s.auth.PreviewInvitation(r.Context(), r.PathValue("token"))
	if errors.Is(err, auth.ErrInvitationInvalid) {
		writeError(w, http.StatusNotFound, "invitation_invalid", err.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// publicOrigin is the base for links handed to users: the configured base URL
// when set, otherwise the origin of the request (honouring the proxy headers the
// origin check already trusts) so LAN installs still get a working link.
func (s *Server) publicOrigin(r *http.Request) string {
	if o := s.cfg.Origin(); o != "" {
		return o
	}
	host := r.Host
	if fwd := r.Header.Get("X-Forwarded-Host"); fwd != "" {
		host = strings.TrimSpace(strings.Split(fwd, ",")[0])
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0]), "https") {
		scheme = "https"
	}
	return scheme + "://" + host
}

// ---- handlers: sync ----

type syncRequest struct {
	Device string      `json:"device"`
	Cursor int64       `json:"cursor"`
	Ops    []opsync.Op `json:"ops"`
	// TZOffset is the device's zone offset in minutes east of UTC (optional,
	// additive); REST writes that move a due date recompute relative reminders in it.
	TZOffset *int `json:"tzOffset,omitempty"`
}

func (s *Server) handleSync(w http.ResponseWriter, r *http.Request) {
	var in syncRequest
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if in.Device == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "device is required")
		return
	}
	// Devices may not write as an AI assistant or a calendar app: those device
	// ids are reserved for the server's own writers (mcp-write-tools D4).
	if opsync.ReservedDevice(in.Device) {
		writeError(w, http.StatusBadRequest, "invalid_op", "device: server and ids starting with agent:, caldav: or public: are reserved")
		return
	}
	for _, op := range in.Ops {
		if opsync.ReservedDevice(op.Device) {
			writeError(w, http.StatusBadRequest, "invalid_op", "op device: server and ids starting with agent:, caldav: or public: are reserved")
			return
		}
	}
	uid := userFrom(r.Context()).ID
	s.recordTZOffset(r.Context(), uid, in.TZOffset)
	res, err := s.sync.Apply(r.Context(), uid, in.Ops)
	if errors.Is(err, opsync.ErrInvalidOp) {
		writeError(w, http.StatusBadRequest, "invalid_op", err.Error())
		return
	}
	if writeLimited(w, err) {
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if res.Applied > 0 {
		// Wake the other devices of everyone who can see the change; this one
		// learns the cursor from the response.
		s.sync.NotifyApplied(res, in.Device)
	}
	pull, err := s.sync.PullAll(r.Context(), uid, in.Cursor, in.Device, opsync.MaxOpsPerRequest)
	if err != nil {
		s.internal(w, err)
		return
	}
	ops, cursor, more := pull.Ops, pull.Cursor, pull.More
	purged := pull.Purged
	if purged == nil {
		purged = []opsync.PurgedEntity{}
	}
	// The server's value of every refused field travels with the response, so the
	// device restores it without another round trip (project-sharing design D3).
	ops = append(ops, res.Restore...)
	memberships, err := s.sync.Memberships(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	rejected := res.Rejected
	if rejected == nil {
		rejected = []opsync.Rejection{}
	}
	gen, err := s.sync.Generation(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"applied":    res.Applied,
		"duplicates": res.Duplicates,
		"ops":        ops,
		"cursor":     cursor,
		"hasMore":    more,
		"serverTime": time.Now().UnixMilli(),
		// generation changes only when the server is restored from a backup (additive field).
		"generation": gen,
		// Additive (project-sharing): refused ops and the caller's shared projects.
		"rejected":    rejected,
		"memberships": memberships,
		// Additive (trash-and-history): entities purged since the cursor, which
		// devices delete locally, and the Trash retention in days (0 = never).
		"purged":             purged,
		"trashRetentionDays": s.cfg.TrashRetentionDays,
	})
}

// ---- handlers: REST collections (write-through to the op log) ----

const serverDevice = opsync.ServerDevice

func collection(r *http.Request) (string, bool) {
	e, ok := opsync.Plural[r.PathValue("collection")]
	return e, ok
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	entity, ok := collection(r)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "unknown collection")
		return
	}
	after, before, msg := completionRange(r, entity)
	if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	list, err := s.sync.List(r.Context(), userFrom(r.Context()).ID, entity, r.URL.Query().Get("include_deleted") == "true")
	if err != nil {
		s.internal(w, err)
		return
	}
	if after != 0 || before != 0 {
		kept := list[:0]
		for _, e := range list {
			var at float64
			if raw, ok := e["completed_at"]; ok {
				_ = json.Unmarshal(raw, &at)
			}
			// A habit's skipped occurrence record is not a completion (habits D6).
			if string(e["skipped"]) == "true" {
				continue
			}
			if agenttools.InCompletionRange(int64(at), after, before) {
				kept = append(kept, e)
			}
		}
		list = kept
	}
	if err := s.annotateProjects(r.Context(), entity, list...); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{r.PathValue("collection"): list})
}

func (s *Server) handleGet(w http.ResponseWriter, r *http.Request) {
	entity, ok := collection(r)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "unknown collection")
		return
	}
	e, err := s.sync.Get(r.Context(), userFrom(r.Context()).ID, entity, r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return
	}
	if e == nil || e.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "not found")
		return
	}
	if err := s.annotateProjects(r.Context(), entity, e); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func (s *Server) handleCreate(w http.ResponseWriter, r *http.Request) {
	entity, ok := collection(r)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "unknown collection")
		return
	}
	var body map[string]json.RawMessage
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	key, keyed, handled := idempotencyKey(w, r)
	if handled {
		return
	}
	uid := userFrom(r.Context()).ID
	now := time.Now().UnixMilli()
	id := ids.New()
	if keyed {
		id = s.idemEntityID(uid, r.PathValue("collection"), key)
	}
	if _, has := body["created_at"]; !has {
		body["created_at"] = json.RawMessage(fmt.Sprint(now))
	}
	if entity == "task" {
		if _, has := body["priority"]; !has {
			body["priority"] = json.RawMessage("4")
		}
	}
	if entity == "label" {
		if _, has := body["name"]; !has {
			body["name"] = json.RawMessage(`""`)
		}
		if _, has := body["color"]; !has {
			pick := int(now)
			if keyed {
				// A retried keyed create must plan the same colour.
				pick = int(id[0])
			}
			body["color"] = json.RawMessage(fmt.Sprintf("%q", labelPalette[pick%len(labelPalette)]))
		}
	}
	if entity == "view" {
		applyViewDefaults(body)
	}
	if _, has := body["position"]; !has && entity != "reminder" {
		body["position"] = json.RawMessage(fmt.Sprint(now))
	}
	delete(body, "id")
	stripAnnotations(entity, body)
	if entity == "view" {
		if err := s.checkView(r.Context(), userFrom(r.Context()).ID, id, body, nil); err != nil {
			s.viewError(w, err)
			return
		}
	}
	if entity == "task" {
		canonicalizeRecurrence(body)
		// Custom field values become fields.<id> keys before an idempotent
		// replay compares the planned ops (custom-fields D3).
		if msg, err := s.checkTaskFields(r.Context(), uid, body, nil); err != nil {
			s.internal(w, err)
			return
		} else if msg != "" {
			writeError(w, http.StatusBadRequest, "invalid_input", msg)
			return
		}
	}
	if entity == "field" {
		if msg, err := s.checkField(r.Context(), uid, id, body, nil); err != nil {
			s.internal(w, err)
			return
		} else if msg != "" {
			writeError(w, http.StatusBadRequest, "invalid_input", msg)
			return
		}
	}
	if entity == "reminder" {
		if msg, err := s.completeReminderBody(r.Context(), userFrom(r.Context()).ID, body, nil); err != nil {
			s.internal(w, err)
			return
		} else if msg != "" {
			writeError(w, http.StatusBadRequest, "invalid_input", msg)
			return
		}
	}
	if keyed {
		state, err := s.replayState(r.Context(), uid, entity, id, body, func(f string) string { return idemOpID(id, f) })
		if err != nil {
			s.internal(w, err)
			return
		}
		switch state {
		case replayMatch:
			s.writeReplay(w, r, entity, id)
			return
		case replayConflict:
			writeIdempotencyConflict(w, "")
			return
		}
	}
	if msg, err := s.checkReferences(r.Context(), userFrom(r.Context()).ID, entity, body); err != nil {
		s.internal(w, err)
		return
	} else if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	if msg, err := s.checkSections(r.Context(), userFrom(r.Context()).ID, entity, body, nil); err != nil {
		s.internal(w, err)
		return
	} else if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	if err := s.validateParent(r.Context(), entity, id, body, nil); err != nil {
		s.parentError(w, err)
		return
	}
	if keyed {
		ts := s.opTS()
		ops := make([]opsync.Op, 0, len(body))
		for field, value := range body {
			ops = append(ops, opsync.Op{ID: idemOpID(id, field), Entity: entity, EntityID: id, Field: field, Value: value, TS: ts, Device: serverDevice})
		}
		s.writeOps(w, r, entity, id, ops, http.StatusCreated, body)
		return
	}
	s.writeFields(w, r, entity, id, body, http.StatusCreated)
}

// labelPalette gives API-created labels a colour when the caller sets none.
var labelPalette = []string{"#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"}

// checkReferences enforces the REST-only rules that the sync path cannot: a label
// needs a non-empty name, and a task may only reference existing, non-deleted labels.
// It returns a user-facing message when the body is rejected. Type errors are left
// to the schema validation in Apply so the two never disagree.
func (s *Server) checkReferences(ctx context.Context, uid, entity string, body map[string]json.RawMessage) (string, error) {
	if entity == "label" {
		if raw, has := body["name"]; has {
			var name string
			if err := json.Unmarshal(raw, &name); err == nil && strings.TrimSpace(name) == "" {
				return "label.name must not be empty", nil
			}
		}
	}
	if entity == "task" {
		if raw, has := body["labels"]; has {
			var ids []string
			if err := json.Unmarshal(raw, &ids); err != nil {
				return "", nil
			}
			for _, id := range ids {
				l, err := s.sync.Get(ctx, uid, "label", id)
				if err != nil {
					return "", err
				}
				if l == nil || l.Deleted() {
					return fmt.Sprintf("task.labels references unknown or deleted label %q", id), nil
				}
			}
		}
	}
	return "", nil
}

// errInvalidParent marks a parent_id rejected by validateTaskParent or validateProjectParent.
var errInvalidParent = errors.New("invalid parent")

// validateParent dispatches the tree rules of the entity being written.
func (s *Server) validateParent(ctx context.Context, entity, id string, body map[string]json.RawMessage, existing opsync.Entity) error {
	uid := userFrom(ctx).ID
	switch entity {
	case "task":
		return s.validateTaskParent(ctx, uid, id, body, existing)
	case "project":
		return s.validateProjectParent(ctx, uid, id, body)
	}
	return nil
}

func (s *Server) parentError(w http.ResponseWriter, err error) {
	if errors.Is(err, errInvalidParent) {
		writeError(w, http.StatusBadRequest, "invalid_input", strings.TrimPrefix(err.Error(), errInvalidParent.Error()+": "))
		return
	}
	s.internal(w, err)
}

// validateTaskParent enforces the subtask tree rules on REST writes (OpenSpec
// `subtasks`): a parent must exist and not be deleted, share the task's project,
// and must not be the task itself or one of its descendants. REST requests are
// handled sequentially against current state, so rejecting is safe here; sync
// ops are never rejected for tree reasons, clients break cycles by display.
func (s *Server) validateTaskParent(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing opsync.Entity) error {
	raw, has := body["parent_id"]
	if !has || string(raw) == "null" {
		return nil
	}
	var parentID string
	if err := json.Unmarshal(raw, &parentID); err != nil || parentID == "" {
		return fmt.Errorf("%w: task.parent_id must be null or a task id", errInvalidParent)
	}
	if parentID == id {
		return fmt.Errorf("%w: task.parent_id: a task cannot be its own parent", errInvalidParent)
	}
	parent, err := s.sync.Get(ctx, uid, "task", parentID)
	if err != nil {
		return err
	}
	if parent == nil || parent.Deleted() {
		return fmt.Errorf("%w: task.parent_id: parent task not found", errInvalidParent)
	}
	project := idOf(body["project_id"])
	if _, has := body["project_id"]; !has && existing != nil {
		project = idOf(existing["project_id"])
	}
	if idOf(parent["project_id"]) != project {
		return fmt.Errorf("%w: task.parent_id: parent must be in the same project", errInvalidParent)
	}
	cycle, err := s.chainReaches(ctx, uid, "task", parentID, parent, id)
	if err != nil {
		return err
	}
	if cycle {
		return fmt.Errorf("%w: task.parent_id: parent is a descendant of the task", errInvalidParent)
	}
	return nil
}

// validateProjectParent enforces the project tree rules on REST writes (OpenSpec
// `project-hierarchy`): a parent must exist and not be deleted, and must not be
// the project itself or one of its descendants. Same reasoning as for tasks: REST
// is sequential against current state, sync ops are never rejected for tree reasons.
func (s *Server) validateProjectParent(ctx context.Context, uid, id string, body map[string]json.RawMessage) error {
	raw, has := body["parent_id"]
	if !has || string(raw) == "null" {
		return nil
	}
	var parentID string
	if err := json.Unmarshal(raw, &parentID); err != nil || parentID == "" {
		return fmt.Errorf("%w: project.parent_id must be null or a project id", errInvalidParent)
	}
	if parentID == id {
		return fmt.Errorf("%w: project.parent_id: a project cannot be its own parent", errInvalidParent)
	}
	parent, err := s.sync.Get(ctx, uid, "project", parentID)
	if err != nil {
		return err
	}
	if parent == nil || parent.Deleted() {
		return fmt.Errorf("%w: project.parent_id: parent project not found", errInvalidParent)
	}
	cycle, err := s.chainReaches(ctx, uid, "project", parentID, parent, id)
	if err != nil {
		return err
	}
	if cycle {
		return fmt.Errorf("%w: project.parent_id: parent is a descendant of the project", errInvalidParent)
	}
	return nil
}

// chainReaches walks parent pointers upwards from `start` in the materialized
// fields and reports whether `target` is on the chain, which would close a cycle.
// The visited set guards against a cycle that already exists in synced data, so
// the walk is bounded by the number of entities.
func (s *Server) chainReaches(ctx context.Context, uid, entity, startID string, start opsync.Entity, target string) (bool, error) {
	seen := map[string]bool{startID: true}
	for cur := start; cur != nil; {
		next := idOf(cur["parent_id"])
		if next == "" {
			return false, nil
		}
		if next == target {
			return true, nil
		}
		if seen[next] {
			return false, nil
		}
		seen[next] = true
		var err error
		if cur, err = s.sync.Get(ctx, uid, entity, next); err != nil {
			return false, err
		}
	}
	return false, nil
}

// idOf decodes a nullable id field; missing and null both read as "".
func idOf(raw json.RawMessage) string {
	var s string
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	_ = json.Unmarshal(raw, &s)
	return s
}

func (s *Server) handlePatch(w http.ResponseWriter, r *http.Request) {
	entity, ok := collection(r)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "unknown collection")
		return
	}
	var body map[string]json.RawMessage
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	delete(body, "id")
	stripAnnotations(entity, body)
	if len(body) == 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "no fields to update")
		return
	}
	existing, err := s.sync.Get(r.Context(), userFrom(r.Context()).ID, entity, r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return
	}
	if existing == nil {
		writeError(w, http.StatusNotFound, "not_found", "not found")
		return
	}
	if msg, err := s.checkReferences(r.Context(), userFrom(r.Context()).ID, entity, body); err != nil {
		s.internal(w, err)
		return
	} else if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	if msg, err := s.checkSections(r.Context(), userFrom(r.Context()).ID, entity, body, existing); err != nil {
		s.internal(w, err)
		return
	} else if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	// Custom fields (custom-fields D3): task values against the definitions of
	// the task's project after the write; definitions keep project and type.
	var fieldMsg string
	switch entity {
	case "task":
		fieldMsg, err = s.checkTaskFields(r.Context(), userFrom(r.Context()).ID, body, existing)
	case "field":
		fieldMsg, err = s.checkField(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), body, existing)
	}
	if err != nil {
		s.internal(w, err)
		return
	} else if fieldMsg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", fieldMsg)
		return
	}
	if len(body) == 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "no fields to update")
		return
	}
	if err := s.validateParent(r.Context(), entity, r.PathValue("id"), body, existing); err != nil {
		s.parentError(w, err)
		return
	}
	if entity == "view" {
		if err := s.checkView(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), body, existing); err != nil {
			s.viewError(w, err)
			return
		}
	}
	var extra []opsync.Op
	ts := s.opTS()
	if entity == "reminder" {
		if msg, err := s.completeReminderBody(r.Context(), userFrom(r.Context()).ID, body, existing); err != nil {
			s.internal(w, err)
			return
		} else if msg != "" {
			writeError(w, http.StatusBadRequest, "invalid_input", msg)
			return
		}
	}
	if entity == "task" {
		canonicalizeRecurrence(body)
		// Completing a recurring task records the occurrence and moves the series.
		recordID, record, ok, err := s.recurringCompletion(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), body, existing, localToday(time.Now()))
		if err != nil {
			s.internal(w, err)
			return
		}
		if ok {
			extra = fieldOps("task", recordID, record, ts)
		}
		// Relative reminders follow the due date and deadline reminders the
		// deadline, stamped like the task op (reminders D2, deadlines D5).
		rops, err := s.reminderOpsForTask(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), body, ts)
		if err != nil {
			s.internal(w, err)
			return
		}
		extra = append(extra, rops...)
	}
	s.writeFieldsAt(w, r, entity, r.PathValue("id"), body, http.StatusOK, extra, ts)
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	entity, ok := collection(r)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "unknown collection")
		return
	}
	existing, err := s.sync.Get(r.Context(), userFrom(r.Context()).ID, entity, r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return
	}
	if existing == nil || existing.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "not found")
		return
	}
	body := map[string]json.RawMessage{"deleted_at": json.RawMessage(fmt.Sprint(time.Now().UnixMilli()))}
	ts := s.opTS()
	var extra []opsync.Op
	if entity == "section" {
		// Its open tasks fall back to "No section" in the same batch (board-view).
		if extra, err = s.sectionDeleteOps(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), ts); err != nil {
			s.internal(w, err)
			return
		}
	}
	s.writeFieldsAt(w, r, entity, r.PathValue("id"), body, http.StatusNoContent, extra, ts)
}

// writeFields turns a REST body into ops stamped with server time and applies them.
func (s *Server) writeFields(w http.ResponseWriter, r *http.Request, entity, id string, body map[string]json.RawMessage, status int) {
	s.writeFieldsWith(w, r, entity, id, body, status, nil)
}

// fieldOps turns the fields of one entity into server-stamped ops.
func fieldOps(entity, id string, body map[string]json.RawMessage, ts int64) []opsync.Op {
	ops := make([]opsync.Op, 0, len(body))
	for field, value := range body {
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: entity, EntityID: id, Field: field, Value: value, TS: ts, Device: serverDevice})
	}
	return ops
}

// writeFieldsWith is writeFields plus extra ops (other entities) applied in the
// same batch; the response still describes entity/id.
func (s *Server) writeFieldsWith(w http.ResponseWriter, r *http.Request, entity, id string, body map[string]json.RawMessage, status int, extra []opsync.Op) {
	s.writeFieldsAt(w, r, entity, id, body, status, extra, s.opTS())
}

// writeFieldsAt is writeFieldsWith with the body's op timestamp chosen by the caller.
func (s *Server) writeFieldsAt(w http.ResponseWriter, r *http.Request, entity, id string, body map[string]json.RawMessage, status int, extra []opsync.Op, ts int64) {
	s.writeOps(w, r, entity, id, append(fieldOps(entity, id, body, ts), extra...), status, nil)
}

// writeOps applies a REST write's ops and answers with entity/id. keyedBody is
// the planned body of an Idempotency-Key create (nil otherwise): a concurrent
// duplicate that applied nothing new answers as a replay or a conflict, and a
// refused keyed create as a conflict.
func (s *Server) writeOps(w http.ResponseWriter, r *http.Request, entity, id string, ops []opsync.Op, status int, keyedBody map[string]json.RawMessage) {
	uid := userFrom(r.Context()).ID
	keyed := keyedBody != nil
	// REST writes are all or nothing: one refused field refuses the request.
	res, err := s.sync.ApplyStrict(r.Context(), uid, ops)
	if err != nil {
		var rej *opsync.RejectedError
		switch {
		case keyed && errors.As(err, &rej) && rej.Reason == opsync.ReasonForbidden:
			// The derived id is taken by an entity this user may not write.
			writeIdempotencyConflict(w, "")
		case writeLimited(w, err):
		case errors.Is(err, opsync.ErrInvalidOp):
			writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		case errors.As(err, &rej) && rej.Reason == opsync.ReasonScopeChange:
			writeError(w, http.StatusBadRequest, "scope_change",
				"task.project_id: the target project is shared differently; create a copy there and delete this task instead")
		case errors.As(err, &rej) && rej.Reason == opsync.ReasonCycle:
			writeError(w, http.StatusBadRequest, "invalid_input",
				fmt.Sprintf("task.blocked_by: %q already waits for this task, so this would make it wait for itself", rej.Detail))
		case errors.As(err, &rej) && rej.Reason == opsync.ReasonNotInScope:
			writeError(w, http.StatusBadRequest, "invalid_input",
				fmt.Sprintf("task.blocked_by: %q is not in the same project sharing as this task (blockers must be shared the same way)", rej.Detail))
		case errors.As(err, &rej) && rej.Reason == opsync.ReasonNotAMember:
			writeError(w, http.StatusBadRequest, "not_a_member",
				"task.assignee_id: the assignee must be a member of the task's project (or yourself for a personal task)")
		case errors.As(err, &rej):
			writeError(w, http.StatusForbidden, "forbidden", "your role on this project does not allow changing "+rej.Op.Entity+"."+rej.Op.Field)
		default:
			s.internal(w, err)
		}
		return
	}
	if res.Applied > 0 {
		// REST writes come from no browser device, so every connected device is woken.
		s.sync.NotifyApplied(res, serverDevice)
	} else if keyed {
		// A concurrent request with the same key applied first.
		state, err := s.replayState(r.Context(), uid, entity, id, keyedBody, func(f string) string { return idemOpID(id, f) })
		if err != nil {
			s.internal(w, err)
			return
		}
		if state != replayMatch {
			writeIdempotencyConflict(w, "")
			return
		}
		s.writeReplay(w, r, entity, id)
		return
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	e, err := s.sync.Get(r.Context(), uid, entity, id)
	if err != nil {
		s.internal(w, err)
		return
	}
	if err := s.annotateProjects(r.Context(), entity, e); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, status, e)
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	format := r.URL.Query().Get("format")
	if format != "" && format != "json" && format != "zip" {
		writeError(w, http.StatusBadRequest, "invalid_input", `format: must be "json" or "zip"`)
		return
	}
	out := map[string]any{"format": "opentodo-export", "version": 1, "exportedAt": time.Now().UTC().Format(time.RFC3339)}
	for plural, entity := range opsync.Plural {
		list, err := s.sync.List(r.Context(), uid, entity, true)
		if err != nil {
			s.internal(w, err)
			return
		}
		if err := s.annotateProjects(r.Context(), entity, list...); err != nil {
			s.internal(w, err)
			return
		}
		out[plural] = list
	}
	// Comments are exported too (comments-and-activity), deleted ones included like
	// every other tombstone; they have no REST collection of their own.
	comments, err := s.sync.List(r.Context(), uid, "comment", true)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["comments"] = comments
	// Attachment metadata (attachments D12), removed ones included; the files
	// themselves are in the ZIP export only.
	attachments, err := s.sync.List(r.Context(), uid, "attachment", true)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["attachments"] = attachments
	// The caller's date and time preferences (date-time-preferences D1): personal,
	// no REST collection, but part of what the user owns, so the export carries them.
	prefs, err := s.sync.List(r.Context(), uid, "user_prefs", true)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["user_prefs"] = prefs
	// When the caller last finished a weekly review (stats-and-review D4):
	// personal like user_prefs, restored by an import of an own export.
	review, err := s.sync.List(r.Context(), uid, "review", true)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["review"] = review
	// End-to-end encryption (OpenSpec `e2ee`): content fields above are ciphertext
	// for an encrypted account; the wrapped key record makes the document
	// restorable and decryptable elsewhere with the passphrase. null otherwise.
	rec, err := s.keys().Get(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	out["encryption"] = rec
	if format == "zip" {
		s.writeExportZip(w, r, out, attachments)
		s.audit.Record(r.Context(), audit.ExportRequested(uid, "zip"))
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="opentodo-export.json"`)
	writeJSON(w, http.StatusOK, out)
	s.audit.Record(r.Context(), audit.ExportRequested(uid, "json"))
}

// ---- helpers ----

func (s *Server) internal(w http.ResponseWriter, err error) {
	s.log.Error("request failed", "err", err)
	writeError(w, http.StatusInternalServerError, "internal", "internal error")
}

func readJSON(r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 4<<20)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		return fmt.Errorf("invalid JSON body: %w", err)
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

// rateLimiter is a fixed-window per-key counter, enough to blunt password guessing.
type rateLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string]*window
}

type window struct {
	start time.Time
	count int
}

func newRateLimiter(limit int, w time.Duration) *rateLimiter {
	return &rateLimiter{limit: limit, window: w, hits: map[string]*window{}}
}

// blocked reports whether key already used up its window, without counting an
// attempt (callers that count only failures check this first, then hit).
func (l *rateLimiter) blocked(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	w, ok := l.hits[key]
	return ok && time.Since(w.start) <= l.window && w.count >= l.limit
}

func (l *rateLimiter) allow(key string) bool {
	ok, _ := l.hit(key)
	return ok
}

// hit counts one attempt for key. firstRefusal is true for exactly one refused
// attempt per window: the first one over the limit.
func (l *rateLimiter) hit(key string) (allowed, firstRefusal bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if len(l.hits) > 10000 {
		for k, v := range l.hits {
			if now.Sub(v.start) > l.window {
				delete(l.hits, k)
			}
		}
	}
	w, ok := l.hits[key]
	if !ok || now.Sub(w.start) > l.window {
		l.hits[key] = &window{start: now, count: 1}
		return true, false
	}
	w.count++
	return w.count <= l.limit, w.count == l.limit+1
}
