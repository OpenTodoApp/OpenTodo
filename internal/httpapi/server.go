// Package httpapi exposes the JSON API and wires authentication, the op log and
// the embedded web app into one http.Handler.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

const sessionCookie = "opentodo_session"

// Server holds the dependencies of the HTTP layer.
type Server struct {
	cfg     config.Config
	auth    *auth.Service
	sync    *opsync.Service
	web     http.Handler
	log     *slog.Logger
	version string
	limiter *rateLimiter

	clockMu sync.Mutex
	lastTS  int64
}

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
func New(cfg config.Config, authSvc *auth.Service, syncSvc *opsync.Service, web http.Handler, log *slog.Logger, version string) http.Handler {
	s := &Server{cfg: cfg, auth: authSvc, sync: syncSvc, web: web, log: log, version: version, limiter: newRateLimiter(10, time.Minute)}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/v1/auth/status", s.handleAuthStatus)
	mux.HandleFunc("POST /api/v1/auth/register", s.handleRegister)
	mux.HandleFunc("POST /api/v1/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/v1/auth/logout", s.handleLogout)

	mux.Handle("GET /api/v1/me", s.requireAuth(s.handleMe))
	mux.Handle("GET /api/v1/tokens", s.requireAuth(s.handleListTokens))
	mux.Handle("POST /api/v1/tokens", s.requireAuth(s.handleCreateToken))
	mux.Handle("DELETE /api/v1/tokens/{id}", s.requireAuth(s.handleDeleteToken))
	mux.Handle("POST /api/v1/sync", s.requireAuth(s.handleSync))
	mux.Handle("GET /api/v1/export", s.requireAuth(s.handleExport))
	mux.Handle("GET /api/v1/{collection}", s.requireAuth(s.handleList))
	mux.Handle("POST /api/v1/{collection}", s.requireAuth(s.handleCreate))
	mux.Handle("GET /api/v1/{collection}/{id}", s.requireAuth(s.handleGet))
	mux.Handle("PATCH /api/v1/{collection}/{id}", s.requireAuth(s.handlePatch))
	mux.Handle("DELETE /api/v1/{collection}/{id}", s.requireAuth(s.handleDelete))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "unknown API route")
	})
	if web != nil {
		mux.Handle("/", web)
	}
	return s.securityHeaders(s.logRequests(mux))
}

// ---- middleware ----

type ctxKey int

const userKey ctxKey = 1

func userFrom(ctx context.Context) *auth.User {
	u, _ := ctx.Value(userKey).(*auth.User)
	return u
}

func (s *Server) requireAuth(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, viaCookie, err := s.authenticate(r)
		if err != nil {
			s.log.Error("auth lookup failed", "err", err)
			writeError(w, http.StatusInternalServerError, "internal", "internal error")
			return
		}
		if u == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		if viaCookie && r.Method != http.MethodGet && r.Method != http.MethodHead && !s.originAllowed(r) {
			writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userKey, u)))
	})
}

func (s *Server) authenticate(r *http.Request) (*auth.User, bool, error) {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		u, err := s.auth.UserByToken(r.Context(), strings.TrimSpace(strings.TrimPrefix(h, "Bearer ")))
		if errors.Is(err, auth.ErrNotFound) {
			return nil, false, nil
		}
		return u, false, err
	}
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return nil, false, nil
	}
	u, err := s.auth.UserBySession(r.Context(), c.Value)
	if errors.Is(err, auth.ErrNotFound) {
		return nil, true, nil
	}
	return u, true, err
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

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(sw, r)
		if strings.HasPrefix(r.URL.Path, "/api/") || sw.status >= 400 {
			s.log.Debug("http", "method", r.Method, "path", r.URL.Path, "status", sw.status, "ms", time.Since(start).Milliseconds())
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
	u, _, err := s.authenticate(r)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"setupRequired": count == 0,
		"signupAllowed": allowed,
		"authenticated": u != nil,
		"user":          u,
		"version":       s.version,
	})
}

type credentials struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
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
	u, err := s.auth.Register(r.Context(), c.Email, c.Name, c.Password)
	switch {
	case errors.Is(err, auth.ErrSignupClosed):
		writeError(w, http.StatusForbidden, "signup_closed", err.Error())
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
	s.startSession(w, r, u, http.StatusCreated)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
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
	u, err := s.auth.Authenticate(r.Context(), c.Email, c.Password)
	if errors.Is(err, auth.ErrInvalidCredentials) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", err.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	s.startSession(w, r, u, http.StatusOK)
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, u *auth.User, status int) {
	secret, exp, err := s.auth.CreateSession(r.Context(), u.ID, r.UserAgent())
	if err != nil {
		s.internal(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: secret, Path: "/", Expires: exp,
		HttpOnly: true, Secure: s.cfg.SecureCookies(), SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, status, map[string]any{"user": u})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		_ = s.auth.DeleteSession(r.Context(), c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: s.cfg.SecureCookies(), SameSite: http.SameSiteLaxMode})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"user": userFrom(r.Context())})
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
		Name string `json:"name"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	t, plain, err := s.auth.CreateToken(r.Context(), userFrom(r.Context()).ID, in.Name)
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

// ---- handlers: sync ----

type syncRequest struct {
	Device string      `json:"device"`
	Cursor int64       `json:"cursor"`
	Ops    []opsync.Op `json:"ops"`
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
	uid := userFrom(r.Context()).ID
	res, err := s.sync.Apply(r.Context(), uid, in.Ops)
	if errors.Is(err, opsync.ErrInvalidOp) {
		writeError(w, http.StatusBadRequest, "invalid_op", err.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	ops, cursor, more, err := s.sync.Pull(r.Context(), uid, in.Cursor, in.Device, opsync.MaxOpsPerRequest)
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
	})
}

// ---- handlers: REST collections (write-through to the op log) ----

const serverDevice = "server"

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
	list, err := s.sync.List(r.Context(), userFrom(r.Context()).ID, entity, r.URL.Query().Get("include_deleted") == "true")
	if err != nil {
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
	now := time.Now().UnixMilli()
	id := ids.New()
	if _, has := body["created_at"]; !has {
		body["created_at"] = json.RawMessage(fmt.Sprint(now))
	}
	if entity == "task" {
		if _, has := body["priority"]; !has {
			body["priority"] = json.RawMessage("4")
		}
	}
	if _, has := body["position"]; !has {
		body["position"] = json.RawMessage(fmt.Sprint(now))
	}
	delete(body, "id")
	if err := s.validateParent(r.Context(), entity, id, body, nil); err != nil {
		s.parentError(w, err)
		return
	}
	s.writeFields(w, r, entity, id, body, http.StatusCreated)
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
	if err := s.validateParent(r.Context(), entity, r.PathValue("id"), body, existing); err != nil {
		s.parentError(w, err)
		return
	}
	s.writeFields(w, r, entity, r.PathValue("id"), body, http.StatusOK)
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
	s.writeFields(w, r, entity, r.PathValue("id"), body, http.StatusNoContent)
}

// writeFields turns a REST body into ops stamped with server time and applies them.
func (s *Server) writeFields(w http.ResponseWriter, r *http.Request, entity, id string, body map[string]json.RawMessage, status int) {
	now := s.opTS()
	ops := make([]opsync.Op, 0, len(body))
	for field, value := range body {
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: entity, EntityID: id, Field: field, Value: value, TS: now, Device: serverDevice})
	}
	uid := userFrom(r.Context()).ID
	if _, err := s.sync.Apply(r.Context(), uid, ops); err != nil {
		if errors.Is(err, opsync.ErrInvalidOp) {
			writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
			return
		}
		s.internal(w, err)
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
	writeJSON(w, status, e)
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	out := map[string]any{"format": "opentodo-export", "version": 1, "exportedAt": time.Now().UTC().Format(time.RFC3339)}
	for plural, entity := range opsync.Plural {
		list, err := s.sync.List(r.Context(), uid, entity, true)
		if err != nil {
			s.internal(w, err)
			return
		}
		out[plural] = list
	}
	w.Header().Set("Content-Disposition", `attachment; filename="opentodo-export.json"`)
	writeJSON(w, http.StatusOK, out)
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

func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return strings.TrimSpace(strings.Split(fwd, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
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

func (l *rateLimiter) allow(key string) bool {
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
		return true
	}
	w.count++
	return w.count <= l.limit
}
