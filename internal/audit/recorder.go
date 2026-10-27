package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"
	"unicode/utf8"
)

// MaxUserAgent is the stored length limit of a user agent, as for sessions.
const MaxUserAgent = 200

var (
	// ErrUnknownEvent is returned for a name outside the catalogue.
	ErrUnknownEvent = errors.New("audit: unknown event name")
	// ErrDetailKey is returned for a detail key outside the allow-list.
	ErrDetailKey = errors.New("audit: detail key not allowed")
)

// Recorder writes events to the audit_events table. A nil *Recorder is a valid
// no-op recorder, which keeps packages usable in tests that do not care.
type Recorder struct {
	db  *sql.DB
	log *slog.Logger
	now func() time.Time
}

// New returns a Recorder on db. log receives recorder failures (nil: slog.Default()).
func New(db *sql.DB, log *slog.Logger) *Recorder {
	if log == nil {
		log = slog.Default()
	}
	return &Recorder{db: db, log: log, now: time.Now}
}

// execer is satisfied by *sql.DB and *sql.Tx.
type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

type metaKey struct{}

type requestMeta struct{ ip, userAgent string }

// WithRequest attaches the client address and user agent of the current request
// to ctx. The HTTP layer calls it once per request; the address is stored only
// when the owner enabled address logging.
func WithRequest(ctx context.Context, ip, userAgent string) context.Context {
	return context.WithValue(ctx, metaKey{}, requestMeta{ip: ip, userAgent: userAgent})
}

func metaFrom(ctx context.Context) requestMeta {
	m, _ := ctx.Value(metaKey{}).(requestMeta)
	return m
}

// Record stores an event that observes something already done (sign-in,
// sign-out, export). It is best effort: a failure is logged at error level and
// never fails the caller's request (design D3). It must not be called while the
// caller holds an open transaction on the same single-connection database.
func (r *Recorder) Record(ctx context.Context, e Event) {
	if r == nil {
		return
	}
	if err := r.insert(ctx, r.db, e); err != nil {
		r.log.Error("audit: failed to record event", "event", string(e.Name), "err", err)
	}
}

// RecordTx stores an event inside tx, the transaction of the state change it
// describes, so that the change and its event commit or roll back together.
// The caller must abort the transaction when it returns an error.
func (r *Recorder) RecordTx(ctx context.Context, tx *sql.Tx, e Event) error {
	if r == nil {
		return nil
	}
	return r.insert(ctx, tx, e)
}

// Validate checks an event against the catalogue and the detail allow-list.
func Validate(e Event) error {
	if !Known(e.Name) {
		return fmt.Errorf("%w: %q", ErrUnknownEvent, e.Name)
	}
	if e.Outcome != Success && e.Outcome != Failure {
		return fmt.Errorf("audit: invalid outcome %q", e.Outcome)
	}
	for k := range e.details {
		if !allowedDetailKeys[k] {
			return fmt.Errorf("%w: %q", ErrDetailKey, k)
		}
	}
	return nil
}

func (r *Recorder) insert(ctx context.Context, q execer, e Event) error {
	if err := Validate(e); err != nil {
		return err
	}
	set, err := loadSettings(ctx, q)
	if err != nil {
		return fmt.Errorf("audit: read settings: %w", err)
	}
	meta := metaFrom(ctx)
	var ip any
	if set.LogIP && meta.ip != "" {
		ip = meta.ip
	}
	details := []byte("{}")
	if len(e.details) > 0 {
		if details, err = json.Marshal(e.details); err != nil {
			return err
		}
	}
	_, err = q.ExecContext(ctx, `INSERT INTO audit_events(ts,name,outcome,actor_id,target_id,ip,user_agent,details)
		VALUES(?,?,?,?,?,?,?,?)`,
		r.now().UnixMilli(), string(e.Name), e.Outcome, nullable(e.ActorID), nullable(e.TargetID), ip,
		TruncateUserAgent(meta.userAgent), string(details))
	if err != nil {
		return fmt.Errorf("audit: insert %s: %w", e.Name, err)
	}
	return nil
}

// TruncateUserAgent cuts a user agent to MaxUserAgent bytes without splitting a
// UTF-8 sequence.
func TruncateUserAgent(ua string) string {
	if len(ua) <= MaxUserAgent {
		return ua
	}
	cut := MaxUserAgent
	for cut > 0 && !utf8.RuneStart(ua[cut]) {
		cut--
	}
	return ua[:cut]
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
