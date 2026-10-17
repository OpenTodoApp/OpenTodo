package httpapi

import (
	"errors"
	"net/http"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/digest"
)

// The weekly email digest settings (OpenSpec change `stats-and-review`, design
// D5): server data, never synced. Sessions and full tokens only, also on the
// read: the schedule is the person's, not an assistant's. The PUT is on the
// demo deny list ("Email digest"); a demo has no mailer, so the GET reports the
// digest as unavailable. On a hosted tenant (multi-tenant-host) the opt-in is
// the user's, not an operator setting, so it is not in hostRules; outgoing
// email is the operator's and the routes answer as without a mailer until the
// operator configures it.

func (s *Server) registerDigestRoutes(mux *routes) {
	mux.handle("GET /api/v1/me/email-digest", signedIn.fullTokens(), s.handleGetDigest)
	mux.handle("PUT /api/v1/me/email-digest", signedIn.fullTokens().demoDenied(), s.handlePutDigest)
}

func (s *Server) digestStore() *digest.Store { return digest.NewStore(s.sync.DB(), s.auth.Now) }

type digestDTO struct {
	// Available is false without outgoing email (also on a demo).
	Available bool `json:"available"`
	// Encryption is true for an account with end-to-end encryption: the digest
	// would contain task titles and is not offered.
	Encryption    bool   `json:"encryption"`
	Enabled       bool   `json:"enabled"`
	Weekday       int    `json:"weekday"`
	Hour          int    `json:"hour"`
	TimeZone      string `json:"timeZone"`
	Language      string `json:"language"`
	NextSendAt    *int64 `json:"nextSendAt"`
	LastOutcome   string `json:"lastOutcome,omitempty"`
	LastSentFor   string `json:"lastSentFor,omitempty"`
	LastAttemptAt *int64 `json:"lastAttemptAt"`
}

func (s *Server) digestJSON(st digest.Settings, available, encrypted bool) digestDTO {
	d := digestDTO{Available: available, Encryption: encrypted, Enabled: st.Enabled, Weekday: st.Weekday, Hour: st.Hour,
		TimeZone: st.TimeZone, Language: st.Lang, LastOutcome: st.LastOutcome, LastSentFor: st.LastSentFor}
	if next := digest.NextSendAt(st, s.auth.Now()); available && !encrypted && !next.IsZero() {
		ms := next.UnixMilli()
		d.NextSendAt = &ms
	}
	if st.LastAttemptAt > 0 {
		d.LastAttemptAt = &st.LastAttemptAt
	}
	return d
}

func (s *Server) handleGetDigest(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	st, err := s.digestStore().Get(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	enc, err := s.encryptionEnabled(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.digestJSON(st, s.mailEnabled(ctx), enc))
}

func (s *Server) handlePutDigest(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	var in struct {
		Enabled  *bool   `json:"enabled"`
		Weekday  *int    `json:"weekday"`
		Hour     *int    `json:"hour"`
		TimeZone *string `json:"timeZone"`
		Language *string `json:"language"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	if !s.mailEnabled(ctx) {
		who := "the server owner"
		if s.hosted {
			// On a host outgoing email is the operator's (multi-tenant-host D4).
			who = "the operator of this hosted service"
		}
		writeError(w, http.StatusNotFound, "smtp_disabled", "the weekly digest needs outgoing email, which "+who+" has not configured")
		return
	}
	store := s.digestStore()
	st, err := store.Get(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	was := st.Enabled
	if in.Enabled != nil {
		st.Enabled = *in.Enabled
	}
	if in.Weekday != nil {
		st.Weekday = *in.Weekday
	}
	if in.Hour != nil {
		st.Hour = *in.Hour
	}
	if in.TimeZone != nil {
		st.TimeZone = *in.TimeZone
	}
	if in.Language != nil {
		st.Lang = *in.Language
	}
	enc, err := s.encryptionEnabled(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	if enc && st.Enabled {
		writeError(w, http.StatusConflict, "encryption_enabled", "the weekly digest is not available with end-to-end encryption: it would contain your task titles")
		return
	}
	st.Origin = s.publicOrigin(r)
	saved, err := store.Put(ctx, st)
	var ie *digest.InvalidError
	if errors.As(err, &ie) {
		writeError(w, http.StatusBadRequest, "invalid_input", ie.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if was != saved.Enabled {
		from, to := "off", "on"
		if was {
			from, to = to, from
		}
		s.audit.Record(ctx, audit.SettingsChanged(uid, "email_digest", from, to))
	}
	writeJSON(w, http.StatusOK, s.digestJSON(saved, true, enc))
}
