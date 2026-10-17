package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/mail"
	"github.com/pixari/opentodo/internal/settings"
)

// WithMail (an Option) supplies outgoing email (OpenSpec `outgoing-email`). A
// nil service, as on a demo instance, means "not configured" everywhere.
func WithMail(m *mail.Service) Option { return func(s *Server) { s.mail = m } }

// Test messages per account (design D7, as the push test).
const (
	smtpTestLimit  = 5
	smtpTestWindow = 10 * time.Minute
)

// lastTestKey stores the outcome of the latest test message for the panel.
const lastTestKey = "smtp.last_test"

type smtpLastTest struct {
	At      int64  `json:"at"`
	Outcome string `json:"outcome"`
	Stage   string `json:"stage,omitempty"`
	Reply   string `json:"reply,omitempty"`
}

func (s *Server) registerMailRoutes(mux *http.ServeMux) {
	s.smtpTestLimiter = newRateLimiter(smtpTestLimit, smtpTestWindow)
	mux.Handle("GET /api/v1/settings/smtp", s.requireAuth(s.handleGetSMTP))
	mux.Handle("PUT /api/v1/settings/smtp", s.requireAuth(s.requireFresh(s.handlePutSMTP)))
	mux.Handle("POST /api/v1/settings/smtp/test", s.requireAuth(s.handleTestSMTP))
}

// mailEnabled reports whether outgoing email can be used right now.
func (s *Server) mailEnabled(ctx context.Context) bool {
	return s.mail != nil && !s.cfg.Demo && s.mail.Enabled(ctx)
}

// requireSMTPOwner admits the owner's session only: the configuration holds a
// credential, so no API token may read or change it.
func (s *Server) requireSMTPOwner(w http.ResponseWriter, r *http.Request) *auth.User {
	u := userFrom(r.Context())
	if !s.auth.IsOwner(u) || sessionFrom(r.Context()) == nil {
		writeError(w, http.StatusForbidden, "forbidden", "only the owner can manage outgoing email")
		return nil
	}
	if s.mail == nil {
		writeError(w, http.StatusNotFound, "smtp_disabled", "outgoing email is not available on this server")
		return nil
	}
	return u
}

func (s *Server) smtpJSON(ctx context.Context, c mail.Config) map[string]any {
	out := map[string]any{
		"configured":  c.Enabled(),
		"host":        c.Host,
		"port":        c.Port,
		"security":    c.Security,
		"username":    c.User,
		"passwordSet": c.PasswordSet(),
		"from":        c.From,
		"managedBy":   c.ManagedBy,
		"lastTest":    nil,
	}
	var lt smtpLastTest
	if ok, err := settings.New(s.sync.DB()).Get(ctx, lastTestKey, &lt); err == nil && ok {
		out["lastTest"] = lt
	}
	return out
}

func (s *Server) handleGetSMTP(w http.ResponseWriter, r *http.Request) {
	if s.requireSMTPOwner(w, r) == nil {
		return
	}
	c, err := s.mail.Config(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.smtpJSON(r.Context(), c))
}

func (s *Server) handlePutSMTP(w http.ResponseWriter, r *http.Request) {
	u := s.requireSMTPOwner(w, r)
	if u == nil {
		return
	}
	var in struct {
		Host     *string `json:"host"`
		Port     *int    `json:"port"`
		Security *string `json:"security"`
		Username *string `json:"username"`
		Password *string `json:"password"`
		From     *string `json:"from"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	changes, err := s.mail.Save(r.Context(), mail.Update{Host: in.Host, Port: in.Port, Security: in.Security, User: in.Username, Password: in.Password, From: in.From})
	var ie *mail.InvalidError
	var me *mail.ManagedError
	switch {
	case errors.As(err, &ie):
		writeError(w, http.StatusBadRequest, "invalid_input", ie.Error())
		return
	case errors.As(err, &me):
		writeError(w, http.StatusConflict, "managed_by_env", me.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	for _, ch := range changes {
		s.audit.Record(r.Context(), audit.SettingsChanged(u.ID, ch.Key, ch.From, ch.To))
	}
	if len(changes) > 0 {
		_ = settings.New(s.sync.DB()).Delete(r.Context(), lastTestKey)
	}
	c, err := s.mail.Config(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.smtpJSON(r.Context(), c))
}

// handleTestSMTP sends one message to the owner's own address and reports the
// SMTP server's outcome; delivery failures are a successful diagnostic (200).
func (s *Server) handleTestSMTP(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if !s.auth.IsOwner(u) || tokenFrom(r.Context()).Scope == auth.ScopeRead {
		writeError(w, http.StatusForbidden, "forbidden", "only the owner can send a test message")
		return
	}
	if !s.mailEnabled(r.Context()) {
		writeError(w, http.StatusNotFound, "smtp_disabled", "outgoing email is not configured")
		return
	}
	if !s.smtpTestLimiter.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many test messages, try again in a few minutes")
		return
	}
	err := s.mail.SendTest(r.Context(), mail.Message{To: u.Email, Lang: mail.LangFrom(r.Header.Get("Accept-Language")),
		Origin: s.publicOrigin(r), UserID: u.ID, ActorID: u.ID})
	lt := smtpLastTest{At: time.Now().UnixMilli(), Outcome: "sent"}
	var se *mail.SendError
	switch {
	case err == nil:
	case errors.As(err, &se):
		lt.Outcome, lt.Stage, lt.Reply = "failed", se.Stage, se.Reply
	default:
		s.internal(w, err)
		return
	}
	_ = settings.New(s.sync.DB()).Set(r.Context(), lastTestKey, lt)
	out := map[string]any{"outcome": lt.Outcome, "to": u.Email}
	if lt.Stage != "" {
		out["stage"], out["reply"] = lt.Stage, lt.Reply
	}
	writeJSON(w, http.StatusOK, out)
}

// mailSendError answers a failed send of an authenticated flow (design D6).
func (s *Server) mailSendError(w http.ResponseWriter, err error) {
	if errors.Is(err, mail.ErrRateLimited) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many emails to this address, try again later")
		return
	}
	writeError(w, http.StatusBadGateway, "email_failed", "the email could not be sent; nothing was created, try again or create a link to copy")
}

// inviteMessage validates a `send` flag before anything is created (design D6)
// and prepares the message: 400 without an email, 409 while unconfigured or
// without a base URL (the link is built from it, see mailLinkOrigin), 429
// when a sending limit is full. ok is false when an error was written.
func (s *Server) inviteMessage(w http.ResponseWriter, r *http.Request, send bool, email string, kind mail.Kind, inviter *auth.User, role string) (mail.Message, bool) {
	if !send {
		return mail.Message{}, true
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		writeError(w, http.StatusBadRequest, "invalid_input", "email: sending by email needs an address")
		return mail.Message{}, false
	}
	if !s.mailEnabled(r.Context()) {
		writeError(w, http.StatusConflict, "smtp_disabled", "outgoing email is not configured")
		return mail.Message{}, false
	}
	origin := s.mailLinkOrigin(w)
	if origin == "" {
		return mail.Message{}, false
	}
	m := mail.Message{Kind: kind, To: email, Lang: mail.LangFrom(r.Header.Get("Accept-Language")), Origin: origin,
		ActorID: inviter.ID, Vars: mail.Vars{Inviter: inviter.Name, Role: role}}
	if s.mail.Limited(r.Context(), m) {
		s.mailSendError(w, mail.ErrRateLimited)
		return mail.Message{}, false
	}
	return m, true
}

// inviteLinkOrigin is the base of an invite link: the base URL of a prepared
// message when it is mailed, otherwise the origin shown to the inviter.
func (s *Server) inviteLinkOrigin(r *http.Request, msg mail.Message) string {
	if msg.Origin != "" {
		return msg.Origin
	}
	return s.publicOrigin(r)
}
