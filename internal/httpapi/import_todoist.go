package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/importer"
	ob "github.com/OpenTodoApp/opentodo/internal/outbound"
)

// handleImportTodoist fetches the account's Todoist data with an API token the
// person pasted (OpenSpec change todoist-api-import) and answers it as JSON for
// the import screen, which previews and imports it like a file (json-items).
// One request to Todoist's fixed host through internal/outbound; the token is
// used for it and never stored or logged.
func (s *Server) handleImportTodoist(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	if !s.todoistLimiter.allow(userFrom(r.Context()).ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many Todoist imports, try again in an hour")
		return
	}
	body, err := importer.FetchTodoist(r.Context(), todoistClient(), in.Token, s.cfg.ImportMaxBytes())
	switch {
	case errors.Is(err, importer.ErrTodoistToken):
		writeError(w, http.StatusBadRequest, "invalid_token", "Todoist did not accept this token; copy it again from Todoist's Settings → Integrations → Developer")
		return
	case errors.Is(err, importer.ErrTodoistTooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "the Todoist account is larger than the import limit")
		return
	case err != nil:
		s.log.Warn("todoist import fetch failed", "err", err)
		writeError(w, http.StatusBadGateway, "upstream_failed", "Todoist could not be reached; try again")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(body)
}

// todoistClient is the client of the Todoist request: no private-network
// targets, no redirects (a redirect would carry the token elsewhere), 60 s.
// Tests replace it to reach a local fake.
var todoistClient = func() *http.Client {
	return ob.NewClient(&ob.Dialer{AllowPrivate: func(context.Context) bool { return false }}, 60*time.Second)
}
