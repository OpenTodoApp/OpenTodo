package httpapi

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/settings"
)

// CalDAV (OpenSpec change `caldav`): app-password routes, the owner toggle and
// the /dav/ endpoint. The endpoint authenticates with HTTP Basic and app
// passwords only (never sessions or API tokens) and writes through ApplyStrict
// like every REST route; see caldav_dav.go and caldav_write.go.

// caldavSettingKey holds the owner toggle in the shared settings table (JSON bool).
const caldavSettingKey = "caldav.enabled"

// davRealm is the Basic authentication realm.
const davRealm = "OpenTodo CalDAV"

// caldavState caches the toggle: 0 = not loaded, 1 = off, 2 = on.
type caldavState struct{ v atomic.Int32 }

func (s *Server) registerCaldavRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/v1/app-passwords", s.requireAuth(s.handleListAppPasswords))
	mux.Handle("POST /api/v1/app-passwords", s.requireAuth(s.requireFresh(s.handleCreateAppPassword)))
	mux.Handle("DELETE /api/v1/app-passwords/{id}", s.requireAuth(s.handleRevokeAppPassword))
	mux.Handle("GET /api/v1/settings/caldav", s.requireAuth(s.handleGetCaldavSetting))
	mux.Handle("PUT /api/v1/settings/caldav", s.requireAuth(s.handlePutCaldavSetting))
	mux.HandleFunc("/dav/", s.handleDAV)
	mux.HandleFunc("/dav", s.handleDAV)
	mux.HandleFunc("/.well-known/caldav", s.handleDAV)
	mux.HandleFunc("/.well-known/caldav/", s.handleDAV)
}

// seedCaldav applies the OPENTODO_CALDAV preset on first start only.
func (s *Server) seedCaldav(ctx context.Context) {
	if s.cfg.CalDAV == nil {
		return
	}
	v := "false"
	if *s.cfg.CalDAV {
		v = "true"
	}
	if _, err := s.sync.DB().ExecContext(ctx, `INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)`,
		caldavSettingKey, v, time.Now().UnixMilli()); err != nil {
		s.log.Error("seed caldav setting", "err", err)
	}
}

// caldavEnabled reads the toggle through the in-memory cache.
func (s *Server) caldavEnabled(ctx context.Context) bool {
	switch s.caldav.v.Load() {
	case 1:
		return false
	case 2:
		return true
	}
	var on bool
	if _, err := settings.New(s.sync.DB()).Get(ctx, caldavSettingKey, &on); err != nil {
		s.log.Error("read caldav setting", "err", err)
		return false
	}
	s.setCaldavCache(on)
	return on
}

func (s *Server) setCaldavCache(on bool) {
	if on {
		s.caldav.v.Store(2)
	} else {
		s.caldav.v.Store(1)
	}
}

// caldavURL is the address clients are configured with.
func (s *Server) caldavURL(r *http.Request) string { return s.publicOrigin(r) + "/dav/" }

func (s *Server) caldavSettingBody(r *http.Request, on bool) map[string]any {
	return map[string]any{"enabled": on, "url": s.caldavURL(r), "secure": strings.HasPrefix(s.caldavURL(r), "https://")}
}

// handleGetCaldavSetting tells every signed-in user whether the endpoint is on
// and where it is, so the Settings screen can show setup instructions; only the
// owner may change it.
func (s *Server) handleGetCaldavSetting(w http.ResponseWriter, r *http.Request) {
	body := s.caldavSettingBody(r, s.caldavEnabled(r.Context()))
	// Tells the Settings screen why the endpoint refuses this account (OpenSpec `e2ee`).
	body["encryption"] = s.encryptionStatus(r.Context(), userFrom(r.Context()).ID).Enabled
	writeJSON(w, http.StatusOK, body)
}

func (s *Server) handlePutCaldavSetting(w http.ResponseWriter, r *http.Request) {
	if !requireOwner(w, r, "the CalDAV setting") {
		return
	}
	var in struct {
		Enabled *bool `json:"enabled"`
	}
	if err := readJSON(r, &in); err != nil || in.Enabled == nil {
		writeError(w, http.StatusBadRequest, "invalid_input", `body must be {"enabled": true|false}`)
		return
	}
	before := s.caldavEnabled(r.Context())
	if err := settings.New(s.sync.DB()).Set(r.Context(), caldavSettingKey, *in.Enabled); err != nil {
		s.internal(w, err)
		return
	}
	s.setCaldavCache(*in.Enabled)
	if before != *in.Enabled {
		s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, caldavSettingKey, boolText(before), boolText(*in.Enabled)))
	}
	writeJSON(w, http.StatusOK, s.caldavSettingBody(r, *in.Enabled))
}

func boolText(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func (s *Server) handleListAppPasswords(w http.ResponseWriter, r *http.Request) {
	list, err := s.auth.ListAppPasswords(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"appPasswords": list})
}

func (s *Server) handleCreateAppPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	// CalDAV clients need plaintext titles (OpenSpec `e2ee`): refused while the
	// account encrypts its content, see handleDAV.
	if s.refuseIfEncrypted(w, r, "CalDAV is not available for accounts with end-to-end encryption") {
		return
	}
	p, plain, err := s.auth.CreateAppPassword(r.Context(), userFrom(r.Context()).ID, in.Name)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"appPassword": p, "secret": plain})
}

func (s *Server) handleRevokeAppPassword(w http.ResponseWriter, r *http.Request) {
	err := s.auth.RevokeAppPassword(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "app password not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// davAuth resolves HTTP Basic credentials (email and app password). Failures,
// including revoked passwords, count toward a per-address limit of 10 a minute;
// while an address is over it every attempt is refused with 429.
func (s *Server) davAuth(w http.ResponseWriter, r *http.Request) (*auth.User, string, bool) {
	ip := clientIP(r)
	if s.davLimiter.blocked(ip) {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "too many failed attempts", http.StatusTooManyRequests)
		return nil, "", false
	}
	challenge := func() {
		w.Header().Set("WWW-Authenticate", `Basic realm="`+davRealm+`", charset="UTF-8"`)
		http.Error(w, "authentication required", http.StatusUnauthorized)
	}
	email, secret, ok := basicAuth(r)
	if !ok {
		challenge()
		return nil, "", false
	}
	u, id, err := s.auth.UserByAppPassword(r.Context(), email, secret)
	if errors.Is(err, auth.ErrNotFound) {
		s.davLimiter.allow(ip)
		challenge()
		return nil, "", false
	}
	if err != nil {
		s.log.Error("caldav auth lookup failed", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return nil, "", false
	}
	return u, id, true
}

func basicAuth(r *http.Request) (user, pass string, ok bool) {
	h := r.Header.Get("Authorization")
	const prefix = "Basic "
	if len(h) < len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return "", "", false
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(h[len(prefix):]))
	if err != nil {
		return "", "", false
	}
	user, pass, ok = strings.Cut(string(raw), ":")
	return user, pass, ok && user != "" && pass != ""
}
