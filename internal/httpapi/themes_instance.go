package httpapi

import (
	"errors"
	"io"
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/settings"
	"github.com/OpenTodoApp/opentodo/internal/themes"
)

// The instance's themes (OpenSpec change theme-instance-default, design D2): the
// owner's default light and dark theme and the instance themes every member can
// choose. Members read them; only the owner changes them, never on the demo
// instance, and every change is recorded as settings.changed with ids only.

func (s *Server) registerInstanceThemeRoutes(mux *routes) {
	mux.handle("GET /api/v1/themes/instance", signedIn, s.handleGetInstanceThemes)
	mux.handle("PUT /api/v1/settings/themes/default", ownerOnly("set the default theme").DemoDenied(), s.handlePutThemeDefault)
	mux.handle("PUT /api/v1/settings/themes/instance/{id}", ownerOnly("change an instance theme").DemoDenied(), s.handlePutInstanceTheme)
	mux.handle("DELETE /api/v1/settings/themes/instance/{id}", ownerOnly("remove an instance theme").DemoDenied(), s.handleDeleteInstanceTheme)
}

// themesVersion is what auth/status reports, so devices know when to read again.
func (s *Server) themesVersion(r *http.Request) int64 {
	t, err := s.settings.Themes(r.Context())
	if err != nil {
		s.log.Warn("read instance themes", "err", err)
		return 0
	}
	return t.Version
}

func (s *Server) handleGetInstanceThemes(w http.ResponseWriter, r *http.Request) {
	t, err := s.settings.Themes(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, t)
}

// writeThemeError answers a refused change, or an internal error.
func (s *Server) writeThemeError(w http.ResponseWriter, err error) {
	var in *settings.ThemeInputError
	if !errors.As(err, &in) {
		s.internal(w, err)
		return
	}
	switch {
	case errors.Is(err, settings.ErrThemeTooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", in.Msg)
	case errors.Is(err, settings.ErrThemeLimit):
		writeError(w, http.StatusConflict, "limit_reached", in.Msg)
	case errors.Is(err, settings.ErrThemeNotFound):
		writeError(w, http.StatusNotFound, "not_found", in.Msg)
	default:
		writeError(w, http.StatusBadRequest, "invalid_input", in.Msg)
	}
}

func (s *Server) handlePutThemeDefault(w http.ResponseWriter, r *http.Request) {
	var in settings.ThemeDefault
	if err := readJSON(r, &in); err != nil {
		badBodyWith(w, err, "invalid_input", "a JSON body with light and dark is required")
		return
	}
	before, err := s.settings.Themes(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	next, err := s.settings.SetThemeDefault(r.Context(), in)
	if err != nil {
		s.writeThemeError(w, err)
		return
	}
	uid := userFrom(r.Context()).ID
	if before.Default.Light != next.Default.Light {
		s.audit.Record(r.Context(), audit.SettingsChanged(uid, settings.ThemesDefaultKey+".light", before.Default.Light, next.Default.Light))
	}
	if before.Default.Dark != next.Default.Dark {
		s.audit.Record(r.Context(), audit.SettingsChanged(uid, settings.ThemesDefaultKey+".dark", before.Default.Dark, next.Default.Dark))
	}
	writeJSON(w, http.StatusOK, next)
}

func (s *Server) handlePutInstanceTheme(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, themes.MaxBytes+1))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) || len(body) > themes.MaxBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "a theme document is at most 16 KB")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "the theme document could not be read")
		return
	}
	id := r.PathValue("id")
	next, id, err := s.settings.PutInstanceTheme(r.Context(), id, body)
	if err != nil {
		s.writeThemeError(w, err)
		return
	}
	change := "changed"
	if r.PathValue("id") == "new" {
		change = "added"
	}
	s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, settings.ThemesInstanceKey, change, id))
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "version": next.Version, "default": next.Default, "themes": next.Themes})
}

func (s *Server) handleDeleteInstanceTheme(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	next, err := s.settings.RemoveInstanceTheme(r.Context(), id)
	if err != nil {
		s.writeThemeError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, settings.ThemesInstanceKey, "removed", id))
	writeJSON(w, http.StatusOK, next)
}
