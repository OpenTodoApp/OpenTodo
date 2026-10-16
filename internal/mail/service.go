package mail

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/settings"
)

// Errors from Send besides *SendError.
var (
	ErrDisabled    = errors.New("mail: outgoing email is not configured")
	ErrRateLimited = errors.New("mail: sending limit reached")
	ErrEncrypted   = errors.New("mail: the recipient's account is encrypted")
)

// Sender delivers one assembled message (the SMTP transport, or a fake in tests).
type Sender interface {
	Send(ctx context.Context, c Config, to string, data []byte) error
}

// EncryptionChecker reports whether an account has end-to-end encryption on.
type EncryptionChecker interface {
	Enabled(ctx context.Context, userID string) (bool, error)
}

// Options configure a Service; zero values are production defaults.
type Options struct {
	Env       config.SMTPConfig
	Audit     *audit.Recorder
	Log       *slog.Logger
	E2EE      EncryptionChecker
	Transport Sender
	Now       func() time.Time
}

// Service is the configuration plus the send path every message takes.
type Service struct {
	settings  *settings.Store
	secrets   *settings.SecretsFile
	env       config.SMTPConfig
	audit     *audit.Recorder
	log       *slog.Logger
	e2ee      EncryptionChecker
	transport Sender
	now       func() time.Time
	limiter   *Limiter
}

// New wires a Service over the settings store and <dataDir>/secrets/smtp.json.
func New(store *settings.Store, dataDir string, o Options) *Service {
	if o.Log == nil {
		o.Log = slog.Default()
	}
	if o.Now == nil {
		o.Now = time.Now
	}
	if o.Transport == nil {
		o.Transport = &Transport{}
	}
	return &Service{settings: store, secrets: settings.NewSecretsFile(dataDir, "smtp"), env: o.Env, audit: o.Audit,
		log: o.Log, e2ee: o.E2EE, transport: o.Transport, now: o.Now, limiter: NewLimiter(o.Now)}
}

// SecretsPath is the password file (for docs and tests).
func (s *Service) SecretsPath() string { return s.secrets.Path() }

func (s *Service) record(ctx context.Context, e audit.Event) {
	if s.audit != nil {
		s.audit.Record(ctx, e)
	}
}

// Send renders and delivers m with the current configuration: refused when
// unconfigured, for a content-bearing kind to an encrypted account, or over a
// limit; otherwise sent synchronously, never queued or retried. Every outcome
// except ErrDisabled is audited; the link is never logged.
func (s *Service) Send(ctx context.Context, m Message) error {
	return s.send(ctx, m, true)
}

// Limited reports whether m would be refused by a sending limit and, if so,
// records the refusal. Callers check it before creating a link they would
// otherwise have to revoke (a new reset link revokes the earlier ones).
func (s *Service) Limited(ctx context.Context, m Message) bool {
	if s == nil || !s.limiter.Full(m.Kind, m.To) {
		return false
	}
	s.record(ctx, audit.EmailFailed(m.ActorID, m.UserID, string(m.Kind), m.To, audit.ReasonRateLimited))
	return true
}

// RecordFailure audits a message that will not be sent for a reason decided by
// its caller (the digest scheduler's `skipped` after its retry window closed).
func (s *Service) RecordFailure(ctx context.Context, m Message, reason string) {
	if s != nil {
		s.record(ctx, audit.EmailFailed(m.ActorID, m.UserID, string(m.Kind), m.To, reason))
	}
}

// SendTest sends the test message, bypassing the sending limits (the route has
// its own), and returns the delivery error.
func (s *Service) SendTest(ctx context.Context, m Message) error {
	m.Kind = KindTest
	return s.send(ctx, m, false)
}

func (s *Service) send(ctx context.Context, m Message, limited bool) error {
	if s == nil {
		return ErrDisabled
	}
	c, err := s.Config(ctx)
	if err != nil {
		return err
	}
	if !c.Enabled() {
		return ErrDisabled
	}
	kind := string(m.Kind)
	fail := func(reason string) { s.record(ctx, audit.EmailFailed(m.ActorID, m.UserID, kind, m.To, reason)) }
	if carriesContent[m.Kind] && m.UserID != "" && s.e2ee != nil {
		on, err := s.e2ee.Enabled(ctx, m.UserID)
		if err != nil {
			return err
		}
		if on {
			fail("encrypted_account")
			return ErrEncrypted
		}
	}
	if limited && !s.limiter.Allow(m.Kind, m.To) {
		fail(audit.ReasonRateLimited)
		return ErrRateLimited
	}
	subject, body, err := Render(m, m.Origin)
	if err != nil {
		return err
	}
	data, err := Assemble(c.From, m.To, subject, body, m.Origin, s.now())
	if err != nil {
		return err
	}
	if err := s.transport.Send(ctx, c, m.To, data); err != nil {
		var se *SendError
		stage := StageSend
		if errors.As(err, &se) {
			stage = se.Stage
		}
		s.log.Warn("outgoing email failed", "kind", kind, "stage", stage)
		fail(stage)
		return err
	}
	s.log.Info("outgoing email sent", "kind", kind)
	s.record(ctx, audit.EmailSent(m.ActorID, m.UserID, kind, m.To))
	return nil
}
