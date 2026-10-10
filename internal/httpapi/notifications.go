package httpapi

import (
	"errors"
	"net/http"

	"github.com/pixari/opentodo/internal/notify"
)

// In-app notifications (OpenSpec change `task-assignment`, design D4). Both
// routes require authentication and only ever touch the caller's own rows: an id
// that belongs to someone else answers the same 404 as an unknown one.

// WithNotifications serves the caller's in-app notifications from inbox. Without
// it, New creates an in-app sink on the sync service's database and registers it
// with the sync service, so assignment notifications always work.
func WithNotifications(inbox *notify.InApp) Option {
	return func(s *Server) { s.inbox = inbox }
}

func (s *Server) registerNotificationRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/v1/notifications", s.requireAuth(s.handleListNotifications))
	mux.Handle("POST /api/v1/notifications/{id}/read", s.requireAuth(s.handleReadNotification))
}

func (s *Server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	list, unread, err := s.inbox.List(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"notifications": list, "unread": unread})
}

func (s *Server) handleReadNotification(w http.ResponseWriter, r *http.Request) {
	err := s.inbox.MarkRead(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if errors.Is(err, notify.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "notification not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
