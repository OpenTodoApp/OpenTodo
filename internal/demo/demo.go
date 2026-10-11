// Package demo runs a public demo instance (OpenSpec changes `demo-mode` and
// `demo-sandboxes`): OPENTODO_DEMO=true provisions a hidden owner and gives
// every visitor a private, short-lived sandbox (a password-less account plus a
// non-interactive collaborator) seeded with realistic data through the op log.
// Sandboxes expire after two hours of inactivity or a day at most, and the
// nightly reset deletes them all. The HTTP layer refuses abusable features and
// serves the sandbox route separately (internal/httpapi/demo.go).
package demo

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/settings"
	opsync "github.com/pixari/opentodo/internal/sync"
)

const (
	// Name is the visitor's display name in a sandbox and CollaboratorName the
	// name of its non-interactive collaborator (demo-sandboxes D1).
	Name             = "Alex Demo"
	CollaboratorName = "Sam Rivera"
	// OwnerEmail is the hidden server owner created on an empty data directory.
	// Its password is random and discarded, so nobody can sign in as the owner
	// and every owner-only setting stays at its default (demo-mode D2).
	OwnerEmail = "owner@demo.invalid"
	OwnerName  = "Demo server owner"
)

// legacyEmails are the shared accounts of the first demo-mode version (a
// public password and a second member). They are deleted on the first start
// of this version (demo-sandboxes D4).
var legacyEmails = []string{"demo@example.com", "sam@example.com"}

// ResetHour is the UTC hour of the nightly reset.
const ResetHour = 3

// Sandbox lifetimes and limits (demo-sandboxes D3, D4).
const (
	IdleTimeout     = 2 * time.Hour
	MaxLifetime     = 24 * time.Hour
	CleanupInterval = 5 * time.Minute
	// EvictAfter is how long a sandbox must have been idle before a new visitor
	// may take its place when the live cap is reached.
	EvictAfter = 15 * time.Minute
	// TouchInterval bounds how often last_active_at is written per sandbox.
	TouchInterval = time.Minute
	// TokenTTL is the lifetime of a sandbox-creation token.
	TokenTTL = 10 * time.Minute
	// PerAddressPerHour caps new sandboxes per client address.
	PerAddressPerHour = 5
	// OpsPerHour and OpsTotal are a sandbox's write budget.
	OpsPerHour = 600
	OpsTotal   = 5000
	// BytesTotal caps the summed value size of a sandbox's stored ops.
	BytesTotal = 2 << 20
	// MaxTextBytes and MaxNotesBytes cap op values in a sandbox: notes
	// (task.description, task.notes_doc) and everything else.
	MaxTextBytes  = 4 * 1024
	MaxNotesBytes = 32 * 1024
	// DefaultMaxSandboxes and DefaultMaxDBMB are the defaults of the optional
	// OPENTODO_DEMO_MAX_SANDBOXES and OPENTODO_DEMO_MAX_DB_MB.
	DefaultMaxSandboxes = 500
	DefaultMaxDBMB      = 1024
)

// resetKey stores the Unix millisecond time of the last nightly reset in
// settings (the key predates sandboxes, when the reset reseeded shared data).
const resetKey = "demo.seeded_at"

// Errors of sandbox creation, mapped to HTTP statuses by the API layer.
var (
	// ErrBadToken: missing, forged, expired or already used creation token (403).
	ErrBadToken = errors.New("the demo page expired; reload it and try again")
	// ErrRateLimited: the address created too many sandboxes this hour (429).
	ErrRateLimited = errors.New("too many new demo sandboxes from your network, try again later")
	// ErrBusy: the live cap or the database size guard was reached (503).
	ErrBusy = errors.New("The demo is busy, try again in a few minutes")
)

// SandboxHours is the idle and maximum lifetime of a sandbox, in hours.
type SandboxHours struct {
	Idle int `json:"idle"`
	Max  int `json:"max"`
}

// Info is what the sign-in screen needs (auth/status `demo` field): a fresh
// creation token, the sandbox lifetimes and the next nightly reset. It carries
// no credentials.
type Info struct {
	Token        string       `json:"token"`
	SandboxHours SandboxHours `json:"sandboxHours"`
	// ResetsAt is the next nightly reset (Unix ms).
	ResetsAt int64 `json:"resetsAt"`
}

// Service provisions, seeds, limits and expires demo sandboxes.
type Service struct {
	auth     *auth.Service
	sync     *opsync.Service
	settings *settings.Store
	log      *slog.Logger
	now      func() time.Time

	// createMu serializes the limit checks and the reservation of a sandbox in
	// this process; resetMu serializes resets.
	createMu sync.Mutex
	resetMu  sync.Mutex

	// salt hashes client addresses; it lives only in this process's memory, so
	// stored hashes cannot be linked to an address after a restart.
	salt []byte
	// tokenKey signs creation tokens; it is shared through the settings table so
	// a token issued by one process is accepted by another (rolling updates).
	tokenKey []byte

	maxSandboxes int
	maxDBBytes   int64

	// touched remembers the last last_active_at write per sandbox (Unix ms).
	touched sync.Map
	// vacuumPending is set when sandboxes were deleted at startup; the jobs
	// leader reclaims the space when its loop starts.
	vacuumPending atomic.Bool
}

// New wires a Service. log may be nil.
func New(authSvc *auth.Service, syncSvc *opsync.Service, log *slog.Logger) *Service {
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	salt := make([]byte, 32)
	_, _ = rand.Read(salt)
	return &Service{auth: authSvc, sync: syncSvc, settings: settings.New(syncSvc.DB()), log: log, now: time.Now, salt: salt,
		maxSandboxes: DefaultMaxSandboxes, maxDBBytes: DefaultMaxDBMB << 20}
}

// SetClock replaces the time source (tests).
func (s *Service) SetClock(now func() time.Time) { s.now = now }

// SetLimits applies the optional tuning variables; zero keeps a default.
func (s *Service) SetLimits(maxSandboxes, maxDBMB int) {
	if maxSandboxes > 0 {
		s.maxSandboxes = maxSandboxes
	}
	if maxDBMB > 0 {
		s.maxDBBytes = int64(maxDBMB) << 20
	}
}

// Info returns a fresh creation token, the sandbox lifetimes and the next reset.
func (s *Service) Info() Info {
	return Info{Token: s.issueToken(), SandboxHours: SandboxHours{Idle: int(IdleTimeout / time.Hour), Max: int(MaxLifetime / time.Hour)},
		ResetsAt: NextReset(s.now()).UnixMilli()}
}

// EnsureOwner creates the hidden owner on an empty server. It is idempotent.
func (s *Service) EnsureOwner(ctx context.Context) error {
	n, err := s.auth.UserCount(ctx)
	if err != nil {
		return err
	}
	if n == 0 {
		if _, err := s.auth.CreateAccount(ctx, OwnerEmail, OwnerName, randomPassword(), "owner"); err != nil {
			return fmt.Errorf("demo owner: %w", err)
		}
	}
	return nil
}

// Start prepares the instance before it serves requests: the token key, the
// hidden owner, removal of the shared accounts of the first demo version, and
// the reset when the last one predates the most recent nightly reset time (the
// server was down at 03:00 UTC). Live sandboxes survive a plain restart. The
// disk space of a startup reset is reclaimed by the jobs leader (Run).
func (s *Service) Start(ctx context.Context) error {
	if err := s.loadTokenKey(ctx); err != nil {
		return err
	}
	if err := s.EnsureOwner(ctx); err != nil {
		return err
	}
	if n, err := s.deleteLegacy(ctx); err != nil {
		return err
	} else if n > 0 {
		s.vacuumPending.Store(true)
		s.log.Info("demo: deleted the shared demo accounts of the previous version", "accounts", n)
	}
	at, err := s.LastReset(ctx)
	if err != nil {
		return err
	}
	if Stale(at, s.now()) {
		return s.reset(ctx, false)
	}
	return nil
}

// Reset deletes every sandbox with its accounts, sessions and data, then runs
// VACUUM so the freed pages go back to the file system (demo-sandboxes D4).
// Call it from the jobs leader (nightly, or on SIGUSR1).
func (s *Service) Reset(ctx context.Context) error { return s.reset(ctx, true) }

func (s *Service) reset(ctx context.Context, vacuum bool) error {
	s.resetMu.Lock()
	defer s.resetMu.Unlock()
	n, err := s.deleteWhere(ctx, `1 = 1`)
	if err != nil {
		return fmt.Errorf("demo reset: %w", err)
	}
	if err := s.settings.Set(ctx, resetKey, s.now().UnixMilli()); err != nil {
		return err
	}
	if vacuum {
		if err := s.vacuum(ctx); err != nil {
			return err
		}
	} else if n > 0 {
		s.vacuumPending.Store(true)
	}
	s.log.Info("demo reset: all sandboxes deleted", "sandboxes", n, "next_reset", NextReset(s.now()).Format(time.RFC3339))
	return nil
}

func (s *Service) vacuum(ctx context.Context) error {
	// VACUUM cannot run inside a transaction; the single connection is idle here.
	if _, err := s.sync.DB().ExecContext(ctx, `VACUUM`); err != nil {
		return fmt.Errorf("demo vacuum: %w", err)
	}
	s.vacuumPending.Store(false)
	return nil
}

// LastReset returns the time of the last reset (zero when never reset).
func (s *Service) LastReset(ctx context.Context) (time.Time, error) {
	var ms int64
	ok, err := s.settings.Get(ctx, resetKey, &ms)
	if err != nil || !ok {
		return time.Time{}, err
	}
	return time.UnixMilli(ms), nil
}

// Run is the jobs leader's loop (rolling-updates): it reclaims space left by a
// startup reset, deletes expired sandboxes every CleanupInterval and resets
// everything every night at ResetHour UTC, until ctx is done.
func (s *Service) Run(ctx context.Context) {
	if s.vacuumPending.Load() {
		if err := s.vacuum(ctx); err != nil && ctx.Err() == nil {
			s.log.Error("demo vacuum failed", "err", err)
		}
	}
	s.cleanupLogged(ctx)
	tick := time.NewTicker(CleanupInterval)
	defer tick.Stop()
	for {
		nightly := time.NewTimer(time.Until(NextReset(s.now())))
		select {
		case <-ctx.Done():
			nightly.Stop()
			return
		case <-tick.C:
			nightly.Stop()
			s.cleanupLogged(ctx)
		case <-nightly.C:
			if err := s.Reset(ctx); err != nil && ctx.Err() == nil {
				s.log.Error("demo reset failed", "err", err)
			}
		}
	}
}

func (s *Service) cleanupLogged(ctx context.Context) {
	n, err := s.Cleanup(ctx)
	if err != nil && ctx.Err() == nil {
		s.log.Error("demo sandbox cleanup failed", "err", err)
	} else if n > 0 {
		s.log.Info("demo: expired sandboxes deleted", "sandboxes", n)
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

// Stale reports whether a reset at resetAt predates the most recent reset
// time before now (zero resetAt is always stale).
func Stale(resetAt, now time.Time) bool {
	if resetAt.IsZero() {
		return true
	}
	last := NextReset(now).Add(-24 * time.Hour)
	return resetAt.Before(last)
}

func randomPassword() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
