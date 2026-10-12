package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Trash and history routes (OpenSpec change `trash-and-history`). All require
// authentication. History reads the op log; purge is the only route that removes
// data from it, and only for entities already in the Trash.
func (s *Server) registerTrashRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/v1/tasks/{id}/history", s.requireAuth(s.historyHandler("task")))
	mux.Handle("GET /api/v1/projects/{id}/history", s.requireAuth(s.historyHandler("project")))
	mux.Handle("DELETE /api/v1/tasks/{id}/purge", s.requireAuth(s.purgeHandler("task")))
	mux.Handle("DELETE /api/v1/projects/{id}/purge", s.requireAuth(s.purgeHandler("project")))
	mux.Handle("POST /api/v1/trash/purge", s.requireAuth(s.handleEmptyTrash))
}

func (s *Server) historyHandler(entity string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var before int64
		if v := r.URL.Query().Get("before"); v != "" {
			n, err := strconv.ParseInt(v, 10, 64)
			if err != nil || n < 0 {
				writeError(w, http.StatusBadRequest, "invalid_input", "before must be a Unix millisecond timestamp")
				return
			}
			before = n
		}
		limit := 0
		if v := r.URL.Query().Get("limit"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 || n > opsync.HistoryPageSize {
				writeError(w, http.StatusBadRequest, "invalid_input", "limit must be an integer from 1 to "+strconv.Itoa(opsync.HistoryPageSize))
				return
			}
			limit = n
		}
		h, err := s.sync.History(r.Context(), userFrom(r.Context()).ID, entity, r.PathValue("id"), before, limit)
		if errors.Is(err, opsync.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "not found")
			return
		}
		if err != nil {
			s.internal(w, err)
			return
		}
		if err := s.labelAgentChanges(r.Context(), userFrom(r.Context()).ID, h.ChangeSets); err != nil {
			s.internal(w, err)
			return
		}
		writeJSON(w, http.StatusOK, h)
	}
}

// labelAgentChanges names AI assistant writes in a history page
// (mcp-write-tools D6): "AI assistant (<token name>)" when the viewer owns the
// token and it still exists, "AI assistant" otherwise. Token names are
// personal, so other members of a shared project see only the generic label.
func (s *Server) labelAgentChanges(ctx context.Context, viewerID string, sets []opsync.ChangeSet) error {
	names := map[string]string{}
	for i := range sets {
		tokenID, ok := strings.CutPrefix(sets[i].Device, opsync.AgentDevicePrefix)
		if !ok {
			continue
		}
		name, seen := names[tokenID]
		if !seen {
			var err error
			if name, err = s.auth.TokenName(ctx, viewerID, tokenID); err != nil {
				return err
			}
			names[tokenID] = name
		}
		sets[i].DeviceLabel = "AI assistant"
		if name != "" && sets[i].UserID == viewerID {
			sets[i].DeviceLabel = "AI assistant (" + name + ")"
		}
	}
	return nil
}

func (s *Server) purgeHandler(entity string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		res, err := s.sync.Purge(r.Context(), userFrom(r.Context()).ID, entity, []string{r.PathValue("id")})
		switch {
		case errors.Is(err, opsync.ErrNotFound):
			writeError(w, http.StatusNotFound, "not_found", "not found")
			return
		case errors.Is(err, opsync.ErrNotDeleted):
			writeError(w, http.StatusConflict, "not_deleted", "only items in the Trash can be permanently deleted; delete it first")
			return
		case errors.Is(err, opsync.ErrForbidden):
			writeError(w, http.StatusForbidden, "forbidden", "your role on this project does not allow deleting this "+entity)
			return
		case err != nil:
			s.internal(w, err)
			return
		}
		s.sync.NotifyMembership(res.Audience)
		writeJSON(w, http.StatusOK, map[string]any{"purged": res})
	}
}

func (s *Server) handleEmptyTrash(w http.ResponseWriter, r *http.Request) {
	res, err := s.sync.PurgeTrash(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	s.sync.NotifyMembership(res.Audience)
	writeJSON(w, http.StatusOK, map[string]any{"purged": res})
}
