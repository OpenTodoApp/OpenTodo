// Package demo runs a public demo instance (OpenSpec change `demo-mode`):
// OPENTODO_DEMO=true provisions a hidden owner and two demo accounts, seeds
// realistic data through the op log, and wipes and reseeds it every night.
// The HTTP layer refuses abusable features separately (internal/httpapi/demo.go).
package demo

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/settings"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// The demo credentials are public by design: the sign-in screen shows them.
const (
	Email    = "demo@example.com"
	Password = "opentodo-demo"
	Name     = "Alex Demo"
	// MemberEmail is the second demo account, a member of the shared project.
	// Its password is random and never shown; it exists so the demo has a
	// collaborator with comments, edits and assignments.
	MemberEmail = "sam@example.com"
	MemberName  = "Sam Rivera"
	// OwnerEmail is the hidden server owner created on an empty data directory.
	// Its password is random and discarded, so nobody can sign in as the owner
	// and every owner-only setting stays at its default (design D2).
	OwnerEmail = "owner@demo.invalid"
	OwnerName  = "Demo server owner"
)

// ResetHour is the UTC hour of the nightly reset.
const ResetHour = 3

// seededKey stores the Unix millisecond time of the last seed in settings.
const seededKey = "demo.seeded_at"

// Info is what the sign-in screen needs (auth/status `demo` field).
type Info struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	// ResetsAt is the next nightly reset (Unix ms).
	ResetsAt int64 `json:"resetsAt"`
}

// Service provisions, seeds and resets the demo data.
type Service struct {
	auth     *auth.Service
	sync     *opsync.Service
	settings *settings.Store
	log      *slog.Logger
	now      func() time.Time
	mu       sync.Mutex
}

// New wires a Service. log may be nil.
func New(authSvc *auth.Service, syncSvc *opsync.Service, log *slog.Logger) *Service {
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	return &Service{auth: authSvc, sync: syncSvc, settings: settings.New(syncSvc.DB()), log: log, now: time.Now}
}

// SetClock replaces the time source (tests).
func (s *Service) SetClock(now func() time.Time) { s.now = now }

// Info returns the public demo credentials and the next reset time.
func (s *Service) Info() Info {
	return Info{Email: Email, Password: Password, ResetsAt: NextReset(s.now()).UnixMilli()}
}

// Accounts holds the ids of the two demo accounts.
type Accounts struct {
	Demo   *auth.User
	Member *auth.User
}

// EnsureAccounts creates the hidden owner on an empty server and the two demo
// accounts when they are missing. It is idempotent.
func (s *Service) EnsureAccounts(ctx context.Context) (Accounts, error) {
	n, err := s.auth.UserCount(ctx)
	if err != nil {
		return Accounts{}, err
	}
	if n == 0 {
		if _, err := s.auth.CreateAccount(ctx, OwnerEmail, OwnerName, randomPassword(), "owner"); err != nil {
			return Accounts{}, fmt.Errorf("demo owner: %w", err)
		}
	}
	var a Accounts
	if a.Demo, err = s.ensure(ctx, Email, Name, Password); err != nil {
		return a, err
	}
	if a.Member, err = s.ensure(ctx, MemberEmail, MemberName, randomPassword()); err != nil {
		return a, err
	}
	return a, nil
}

func (s *Service) ensure(ctx context.Context, email, name, password string) (*auth.User, error) {
	u, err := s.auth.UserByEmail(ctx, email)
	if errors.Is(err, auth.ErrNotFound) {
		if u, err = s.auth.CreateAccount(ctx, email, name, password, "member"); err != nil {
			return nil, fmt.Errorf("demo account %s: %w", email, err)
		}
		return u, nil
	}
	return u, err
}

// Reset wipes everything the demo accounts hold and seeds fresh data dated
// relative to today, then wakes their devices (design D3). Concurrent calls
// are serialized.
func (s *Service) Reset(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, err := s.EnsureAccounts(ctx)
	if err != nil {
		return err
	}
	audience, err := s.sync.WipeAccounts(ctx, []string{a.Demo.ID, a.Member.ID})
	if err != nil {
		return fmt.Errorf("demo wipe: %w", err)
	}
	if err := s.seed(ctx, a); err != nil {
		return fmt.Errorf("demo seed: %w", err)
	}
	if err := s.settings.Set(ctx, seededKey, s.now().UnixMilli()); err != nil {
		return err
	}
	s.sync.NotifyMembership(audience)
	s.log.Info("demo data reset", "next_reset", NextReset(s.now()).Format(time.RFC3339))
	return nil
}

// SeededAt returns the time of the last seed (zero when never seeded).
func (s *Service) SeededAt(ctx context.Context) (time.Time, error) {
	var ms int64
	ok, err := s.settings.Get(ctx, seededKey, &ms)
	if err != nil || !ok {
		return time.Time{}, err
	}
	return time.UnixMilli(ms), nil
}

// Start provisions the accounts and resets the data when it was never seeded
// or was seeded before the most recent nightly reset time (the server was down
// at 03:00 UTC, or the data is older than a day).
func (s *Service) Start(ctx context.Context) error {
	if _, err := s.EnsureAccounts(ctx); err != nil {
		return err
	}
	at, err := s.SeededAt(ctx)
	if err != nil {
		return err
	}
	if Stale(at, s.now()) {
		return s.Reset(ctx)
	}
	return nil
}

// Run resets the data every night at ResetHour UTC until ctx is done.
func (s *Service) Run(ctx context.Context) {
	for {
		wait := time.Until(NextReset(s.now()))
		t := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			t.Stop()
			return
		case <-t.C:
		}
		if err := s.Reset(ctx); err != nil && ctx.Err() == nil {
			s.log.Error("demo reset failed", "err", err)
		}
	}
}

// NextReset is the first ResetHour:00 UTC strictly after now.
func NextReset(now time.Time) time.Time {
	u := now.UTC()
	next := time.Date(u.Year(), u.Month(), u.Day(), ResetHour, 0, 0, 0, time.UTC)
	if !next.After(u) {
		next = next.Add(24 * time.Hour)
	}
	return next
}

// Stale reports whether data seeded at seededAt predates the most recent
// reset time before now (zero seededAt is always stale).
func Stale(seededAt, now time.Time) bool {
	if seededAt.IsZero() {
		return true
	}
	last := NextReset(now).Add(-24 * time.Hour)
	return seededAt.Before(last)
}

func randomPassword() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
