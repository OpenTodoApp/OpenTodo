package httpapi

import "net/http"

// Saved locations, read only, so `ot` can set a task's location by name
// (agent-planning-fields D6); they are written through sync like the app does.
func (s *Server) registerPlaceRoutes(mux *routes) {
	mux.handle("GET /api/v1/places", signedIn, s.handleListPlaces)
}

func (s *Server) handleListPlaces(w http.ResponseWriter, r *http.Request) {
	list, err := s.sync.List(r.Context(), userFrom(r.Context()).ID, "place", false)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"places": list})
}
