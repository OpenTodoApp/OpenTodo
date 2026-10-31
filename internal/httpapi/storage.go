package httpapi

import "net/http"

// registerStorageRoutes adds the owner's view of the database file and the
// last notes compaction (OpenSpec `op-log-compaction` D7).
func (s *Server) registerStorageRoutes(mux *routes) {
	mux.handle("GET /api/v1/settings/storage", ownerOnly("see storage").DemoDenied(), s.handleGetStorage)
}

// handleGetStorage answers {database_bytes, free_bytes, wal_bytes,
// last_compaction, conversion, conversion_needed_bytes?}.
func (s *Server) handleGetStorage(w http.ResponseWriter, r *http.Request) {
	st, err := s.set.Compaction.Status(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}
