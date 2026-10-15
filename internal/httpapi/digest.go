package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/digest"
)

// The weekly email digest settings (OpenSpec `stats-and-review`, design D5):
// server data per user, never synced; available only with outgoing email.
func (s *Server) registerDigestRoutes(mux *http.ServeMux) {
	s.digests = digest.NewStore(s.sync.DB())
	mux.Handle("GET /api/v1/me/email-digest", s.requireAuth(s.handleGetDigest))
	mux.Handle("PUT /api/v1/me/email-digest", s.requireAuth(s.handlePutDigest))
}

// digestCaller admits sessions and full tokens: read and agent tokens are
// refused even on GET, the settings decide what mail the account receives.
func (s *Server) digestCaller(w http.ResponseWriter, r *http.Request) *auth.User {
	if sc := tokenFrom(r.Context()).Scope; sc != "" && sc != auth.ScopeFull {
		writeError(w, http.StatusForbidden, "insufficient_scope", "this token cannot read or change the email digest")
		return nil
	}
	return userFrom(r.Context())
}

// digestUnavailable says why digests cannot be sent ("" when they can): no
// outgoing email (always on a demo), or no public address for the review link.
func (s *Server) digestUnavailable(r *http.Request) string {
	if !s.mailEnabled(r.Context()) {
		return "smtp_disabled"
	}
	if s.cfg.Origin() == "" {
		return "base_url_missing"
	}
	return ""
}

func (s *Server) digestJSON(set digest.Settings, reason string, encrypted bool) map[string]any {
	available := reason == ""
	out := map[string]any{"available": available, "unavailableReason": nil, "encrypted": encrypted, "enabled": set.Enabled, "weekday": set.Weekday, "hour": set.Hour,
		"timeZone": set.TimeZone, "language": set.Language, "lastOutcome": nil, "lastSentFor": nil, "nextSendAt": nil}
	if !available {
		out["unavailableReason"] = reason
	}
	if set.LastOutcome != "" {
		out["lastOutcome"] = set.LastOutcome
	}
	if set.LastSentFor != "" {
		out["lastSentFor"] = set.LastSentFor
	}
	if available && !encrypted {
		if next := digest.NextSend(set, time.Now()); next != nil {
			out["nextSendAt"] = next.UnixMilli()
		}
	}
	return out
}

func (s *Server) handleGetDigest(w http.ResponseWriter, r *http.Request) {
	u := s.digestCaller(w, r)
	if u == nil {
		return
	}
	set, err := s.digests.Get(r.Context(), u.ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	encrypted, err := s.keys().Enabled(r.Context(), u.ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.digestJSON(set, s.digestUnavailable(r), encrypted))
}

func (s *Server) handlePutDigest(w http.ResponseWriter, r *http.Request) {
	u := s.digestCaller(w, r)
	if u == nil {
		return
	}
	switch s.digestUnavailable(r) {
	case "smtp_disabled":
		writeError(w, http.StatusNotFound, "smtp_disabled", "the weekly digest needs outgoing email, which the owner has not configured")
		return
	case "base_url_missing":
		writeError(w, http.StatusNotFound, "smtp_disabled", "the weekly digest needs the server's public address (OPENTODO_BASE_URL) for its link")
		return
	}
	var in digest.Settings
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if in.Enabled {
		on, err := s.keys().Enabled(r.Context(), u.ID)
		if err != nil {
			s.internal(w, err)
			return
		}
		if on {
			writeError(w, http.StatusConflict, "encryption_enabled", "the weekly digest is not available with end-to-end encryption: it would contain task titles")
			return
		}
	}
	err := s.digests.Put(r.Context(), u.ID, in)
	var ie *digest.InvalidError
	if errors.As(err, &ie) {
		writeError(w, http.StatusBadRequest, "invalid_input", ie.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	set, err := s.digests.Get(r.Context(), u.ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.digestJSON(set, "", false))
}
