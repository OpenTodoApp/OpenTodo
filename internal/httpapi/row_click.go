package httpapi

import (
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/audit"
)

// The server's "Click a task to" default (OpenSpec change click-default, design
// D2): what a click on a task does for accounts that have not chosen, "select"
// (select, then edit the title) or "open" (open the details). Set like the
// default theme, by the owner, never on a demo; every member reads it in
// auth/status. An account's own choice is the synced user_prefs.row_click.

const rowClickSettingKey = "row_click.default"

// rowClickModes are the values the server accepts; "select" is the default.
var rowClickModes = map[string]bool{"select": true, "open": true}

func (s *Server) registerRowClickRoutes(mux *routes) {
	mux.handle("PUT /api/v1/settings/row-click", ownerOnly("set what a click on a task does").DemoDenied(), s.handlePutRowClick)
}

// rowClickDefault reads the stored default; missing or unknown reads as "select".
func (s *Server) rowClickDefault(r *http.Request) string {
	var v string
	if _, err := s.settings.Get(r.Context(), rowClickSettingKey, &v); err != nil {
		s.log.Warn("read row click default", "err", err)
	}
	if !rowClickModes[v] {
		return "select"
	}
	return v
}

func (s *Server) handlePutRowClick(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Default *string `json:"default"`
	}
	if err := readJSON(r, &in); err != nil || in.Default == nil {
		badBodyWith(w, err, "invalid_input", `body must be {"default": "select"|"open"}`)
		return
	}
	if !rowClickModes[*in.Default] {
		writeError(w, http.StatusBadRequest, "invalid_input", `default: "select" or "open"`)
		return
	}
	before := s.rowClickDefault(r)
	if *in.Default != before {
		if err := s.settings.Set(r.Context(), rowClickSettingKey, *in.Default); err != nil {
			s.internal(w, err)
			return
		}
		s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, rowClickSettingKey, before, *in.Default))
	}
	writeJSON(w, http.StatusOK, map[string]string{"default": *in.Default})
}
