package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/auth"
)

// CalDAV (OpenSpec change `caldav`): app-password routes and the owner toggle
// here; the /dav/ endpoint is the route package internal/httpapi/davroutes.

func (s *Server) registerCaldavRoutes(mux *routes) {
	mux.handle("GET /api/v1/app-passwords", signedIn, s.handleListAppPasswords)
	mux.handle("POST /api/v1/app-passwords", signedIn.Sensitive().DemoDenied(), s.handleCreateAppPassword)
	mux.handle("DELETE /api/v1/app-passwords/{id}", signedIn.DemoDenied(), s.handleRevokeAppPassword)
	// Every signed-in user learns whether the endpoint is on and where it is, so
	// the Settings screen can show setup instructions; only the owner may change it.
	s.switchRoutes(mux, "/api/v1/settings/caldav", switchRoute{sw: s.caldavOn,
		get: signedIn, put: ownerOnly("manage the CalDAV setting").DemoDenied(),
		more: func(r *http.Request) map[string]any {
			body := s.caldavSettingBody(r)
			// Tells the Settings screen why the endpoint refuses this account (OpenSpec `e2ee`).
			body["encryption"] = s.encryptionStatus(r.Context(), userFrom(r.Context()).ID).Enabled
			return body
		},
		putMore: s.caldavSettingBody})
	s.dav.Register(mux)
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
