package httpapi

import (
	"encoding/base64"
	"errors"
	"net/http"
	"strings"

	"github.com/pixari/opentodo/internal/auth"
)

// CalDAV (OpenSpec change `caldav`): app-password routes, the owner toggle and
// the /dav/ endpoint. The endpoint authenticates with HTTP Basic and app
// passwords only (never sessions or API tokens) and writes through ApplyStrict
// like every REST route; see caldav_dav.go and caldav_write.go.

// davRealm is the Basic authentication realm.
const davRealm = "OpenTodo CalDAV"

func (s *Server) registerCaldavRoutes(mux *routes) {
	mux.handle("GET /api/v1/app-passwords", signedIn, s.handleListAppPasswords)
	mux.handle("POST /api/v1/app-passwords", signedIn.sensitive().demoDenied(), s.handleCreateAppPassword)
	mux.handle("DELETE /api/v1/app-passwords/{id}", signedIn.demoDenied(), s.handleRevokeAppPassword)
	// Every signed-in user learns whether the endpoint is on and where it is, so
	// the Settings screen can show setup instructions; only the owner may change it.
	s.switchRoutes(mux, "/api/v1/settings/caldav", switchRoute{sw: s.caldavOn,
		get: signedIn, put: ownerOnly("manage the CalDAV setting").demoDenied(),
		more: func(r *http.Request) map[string]any {
			body := s.caldavSettingBody(r)
			// Tells the Settings screen why the endpoint refuses this account (OpenSpec `e2ee`).
			body["encryption"] = s.encryptionStatus(r.Context(), userFrom(r.Context()).ID).Enabled
			return body
		},
		putMore: s.caldavSettingBody})
	mux.handle("/dav/", public("CalDAV clients authenticate with an app password in the handler").demoDenied(), s.handleDAV)
	mux.handle("/dav", public("CalDAV clients authenticate with an app password in the handler").demoDenied(), s.handleDAV)
	mux.handle("/.well-known/caldav", public("CalDAV discovery; the handler authenticates with an app password").demoDenied(), s.handleDAV)
	mux.handle("/.well-known/caldav/", public("CalDAV discovery; the handler authenticates with an app password").demoDenied(), s.handleDAV)
	// Discovery from the host root (issue #249): Apple's clients probe the root
	// and /principals/ with WebDAV methods when the well-known address does not
	// lead them; without CalDAV these answer as the web app did (405, 404).
	mux.handle("PROPFIND /{$}", public("CalDAV discovery from the host root; redirects to /dav/").demoDenied(), s.handleDAVRoot)
	mux.handle("OPTIONS /{$}", public("CalDAV discovery from the host root; reports the DAV capabilities").demoDenied(), s.handleDAVRoot)
	mux.handle("/principals", public("CalDAV discovery; redirects to the principal under /dav/").demoDenied(), s.handleDAVRoot)
	mux.handle("/principals/", public("CalDAV discovery; redirects to the principal under /dav/").demoDenied(), s.handleDAVRoot)
}

// caldavURL is the address clients are configured with.
func (s *Server) caldavURL(r *http.Request) string { return s.publicOrigin(r) + "/dav/" }

func (s *Server) caldavSettingBody(r *http.Request) map[string]any {
	return map[string]any{"url": s.caldavURL(r), "secure": strings.HasPrefix(s.caldavURL(r), "https://")}
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
		badBody(w, err)
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
