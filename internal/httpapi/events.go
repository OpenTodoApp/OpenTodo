package httpapi

import (
	"fmt"
	"net/http"
	"time"
)

// heartbeatInterval is how often an idle live-update stream writes a comment line.
// 25 s stays below the default idle timeouts of Traefik, Caddy and nginx. Tests
// shorten it.
var heartbeatInterval = 25 * time.Second

// handleEvents serves GET /api/v1/sync/events: a server-sent event stream that
// wakes a device whenever another device (or the REST API) records operations
// for the same user. The payload is only the latest cursor; data still travels
// through the ordinary sync exchange, so a lost event is harmless.
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	device := r.URL.Query().Get("device")
	if device == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "device is required")
		return
	}
	rc := http.NewResponseController(w)
	// Long-lived response: lift the server's read and write deadlines for this
	// connection only, otherwise ReadTimeout/WriteTimeout would cut the stream.
	_ = rc.SetReadDeadline(time.Time{})
	_ = rc.SetWriteDeadline(time.Time{})

	// Register before anything is written so a client that pushes as soon as it
	// sees the stream open cannot race the subscription.
	uid := userFrom(r.Context()).ID
	notifier := s.sync.Notifier()
	sub := notifier.Subscribe(uid, device)
	defer notifier.Unsubscribe(sub)

	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	if r.ProtoMajor == 1 {
		h.Set("Connection", "keep-alive")
	}
	w.WriteHeader(http.StatusOK)
	// An initial comment makes proxies forward the headers right away, which is
	// what fires `open` in EventSource.
	if _, err := fmt.Fprint(w, ": connected\n\n"); err != nil {
		return
	}
	if err := rc.Flush(); err != nil {
		s.log.Warn("live updates: response does not support streaming", "err", err)
		return
	}

	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-sub.Done():
			return
		case seq := <-sub.C():
			data := fmt.Sprintf(`{"cursor":%d}`, seq)
			if seq < 0 {
				// A membership change adds no op (project-sharing): no cursor, so
				// every device runs the exchange and learns its new memberships.
				data = `{}`
			}
			if _, err := fmt.Fprintf(w, "event: ops\ndata: %s\n\n", data); err != nil {
				return
			}
			if err := rc.Flush(); err != nil {
				return
			}
		case <-sub.Calendar():
			// Subscribed calendars changed (calendar-feeds D8): devices refresh their cache.
			if _, err := fmt.Fprint(w, "event: calendar\ndata: {}\n\n"); err != nil {
				return
			}
			if err := rc.Flush(); err != nil {
				return
			}
		case <-ticker.C:
			// Re-validate on every heartbeat so a revoked session or token is cut
			// within one interval.
			u, _, err := s.authenticate(r)
			if err != nil || u == nil || u.ID != uid {
				return
			}
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			if err := rc.Flush(); err != nil {
				return
			}
		}
	}
}
