package digest

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/mail"
	"github.com/pixari/opentodo/internal/zoned"
)

// Scheduler pacing (design D6).
const (
	PassInterval = 5 * time.Minute
	RetryWindow  = 6 * time.Hour
)

// Mailer is the part of the mail service the scheduler uses.
type Mailer interface {
	Enabled(ctx context.Context) bool
	SendDigest(ctx context.Context, m mail.Message) error
}

// Scheduler sends due digests from the jobs leader.
type Scheduler struct {
	Store  *Store
	Reader Reader
	Mail   Mailer
	Audit  *audit.Recorder
	// Origin is the server's public origin, for the review link.
	Origin string
	Now    func() time.Time
	Log    *slog.Logger
}

func (s *Scheduler) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *Scheduler) log() *slog.Logger {
	if s.Log != nil {
		return s.Log
	}
	return slog.Default()
}

// Run passes every PassInterval until ctx ends.
func (s *Scheduler) Run(ctx context.Context) {
	t := time.NewTicker(PassInterval)
	defer t.Stop()
	for {
		s.RunOnce(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// RunOnce sends every digest whose weekday and hour have come in the user's
// zone and that was not sent for that local day; failures are retried by later
// passes until six hours after the hour, then the day is skipped.
func (s *Scheduler) RunOnce(ctx context.Context) {
	// Without a public origin there is no link to the review: nothing is sent
	// (the settings route reports the digest unavailable).
	if s.Mail == nil || s.Origin == "" || !s.Mail.Enabled(ctx) {
		return
	}
	rows, err := s.Store.Enabled(ctx)
	if err != nil {
		s.log().Error("digest: list", "err", err)
		return
	}
	now := s.now()
	for _, row := range rows {
		loc, err := zoned.Load(row.TimeZone)
		if err != nil {
			continue
		}
		local := now.In(loc)
		day := local.Format("2006-01-02")
		if int(local.Weekday()) != row.Weekday || row.LastSentFor == day {
			continue
		}
		at := time.Date(local.Year(), local.Month(), local.Day(), row.Hour, 0, 0, 0, loc)
		if local.Before(at) {
			continue
		}
		if !local.Before(at.Add(RetryWindow)) {
			if s.Audit != nil {
				s.Audit.Record(ctx, audit.EmailFailed("", row.UserID, string(mail.KindDigest), row.Email, "skipped"))
			}
			_ = s.Store.MarkOutcome(ctx, row.UserID, day, "skipped")
			continue
		}
		s.send(ctx, row, day, now)
	}
}

func (s *Scheduler) send(ctx context.Context, row Row, day string, now time.Time) {
	if err := s.Store.MarkAttempt(ctx, row.UserID); err != nil {
		s.log().Error("digest: mark attempt", "err", err)
		return
	}
	msg, err := Build(ctx, s.Reader, row, now, s.Origin)
	if err != nil {
		s.log().Error("digest: build", "err", err)
		return
	}
	err = s.Mail.SendDigest(ctx, msg)
	var se *mail.SendError
	switch {
	case err == nil:
		_ = s.Store.MarkOutcome(ctx, row.UserID, day, "sent")
	case errors.Is(err, mail.ErrEncrypted):
		// Recorded by the mail service; nothing more for this day.
		_ = s.Store.MarkOutcome(ctx, row.UserID, day, "skipped")
	case errors.As(err, &se):
		_ = s.Store.MarkOutcome(ctx, row.UserID, day, se.Stage)
	case errors.Is(err, mail.ErrRateLimited):
		_ = s.Store.MarkOutcome(ctx, row.UserID, day, "rate_limited")
	default:
		s.log().Error("digest: send", "err", err)
		_ = s.Store.MarkOutcome(ctx, row.UserID, day, "send")
	}
}
