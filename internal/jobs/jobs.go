// Package jobs is the one model of background work (OpenSpec change
// `one-job-model`): a tenant describes each kind of work once as a Job (when it
// is next due, and how to run it), and both runners use those descriptions. A
// self-hosted server runs them with Runner, which sleeps until the earliest due
// time and wakes early when a service reports new work; a host
// (internal/host) writes the same due times into its shared index and runs the
// same Run functions when a tenant's entry comes due.
package jobs

import (
	"context"
	"sync"
	"time"
)

// Names of a tenant's jobs. A host stores them as the kinds of its "next due"
// index, so they are stable.
const (
	Reminders    = "reminders"    // web push of due reminders
	Backup       = "backup"       // a scheduled backup
	Webhooks     = "webhooks"     // queued webhook deliveries and notification channel messages
	Calendars    = "calendars"    // calendar subscriptions to fetch and calendar sync cycles
	Housekeeping = "housekeeping" // retention, pruning and upkeep
	Compaction   = "compaction"   // superseded note history and freed pages (op-log-compaction)
	Digest       = "digest"       // weekly digest emails
	Issues       = "issues"       // issue connections to poll
	Rules        = "rules"        // automation rules: queued events and time triggers
	Email        = "email"        // the operator's mailbox (email to task; self-hosted only)
	Demo         = "demo"         // sandbox cleanup and the nightly reset (demo instances only)
	Writes       = "writes"       // writes by another process (self-hosted only)
)

// Timing defaults (design D2).
const (
	// CheckEvery is how long a job's next due time is trusted: a runner asks
	// again at least this often, which finds work made due by a path that sent
	// no wake-up, and bounds the effect of a wall-clock jump.
	CheckEvery = 30 * time.Second
	// RetryAfter is how long a job that is still due right after it ran (a
	// transient failure) waits before it runs again, so it never spins.
	RetryAfter = 30 * time.Second
	// Debounce is how long a runner gathers data changes before it asks every
	// job again.
	Debounce = time.Second
)

// Job is one kind of background work of a tenant.
type Job struct {
	Name string
	// Next reports when the job next has work; ok is false when it has none
	// now. A time in the past means it is due now.
	Next func(ctx context.Context) (at time.Time, ok bool, err error)
	// Run does the work that is due and returns when it is done. A runner never
	// runs one job twice at the same time.
	Run func(ctx context.Context)
	// Check overrides CheckEvery for this job.
	Check time.Duration
	// Retry overrides RetryAfter for this job.
	Retry time.Duration
}

// CheckInterval is how long the job's next due time is trusted.
func (j Job) CheckInterval() time.Duration {
	if j.Check > 0 {
		return j.Check
	}
	return CheckEvery
}

// RetryInterval is the pause before a job that is still due runs again.
func (j Job) RetryInterval() time.Duration {
	if j.Retry > 0 {
		return j.Retry
	}
	return RetryAfter
}

// Clock is the time source of a runner (tests use a fake one).
type Clock interface {
	Now() time.Time
	After(d time.Duration) <-chan time.Time
}

type realClock struct{}

func (realClock) Now() time.Time                         { return time.Now() }
func (realClock) After(d time.Duration) <-chan time.Time { return time.After(d) }

// Real is the system clock.
var Real Clock = realClock{}

type clockAt struct{ now func() time.Time }

func (c clockAt) Now() time.Time                         { return c.now() }
func (c clockAt) After(d time.Duration) <-chan time.Time { return time.After(d) }

// ClockAt is the system timer with now as its time source (a tenant's clock,
// so a runner and the jobs' Next agree on the time); a nil now is Real.
func ClockAt(now func() time.Time) Clock {
	if now == nil {
		return Real
	}
	return clockAt{now}
}

// Signal carries wake-ups from a tenant's services to whatever runs its jobs:
// the self-hosted Runner, a host's scheduler, or nothing (a process that does
// not lead the jobs), in which case they are dropped. The zero value is ready;
// a nil *Signal drops everything.
type Signal struct {
	mu      sync.Mutex
	wake    func(name string)
	changed func()
	count   uint64
}

// Wake reports that the named job may have work now (a delivery was queued).
func (s *Signal) Wake(name string) {
	if s == nil {
		return
	}
	s.mu.Lock()
	s.count++
	fn := s.wake
	s.mu.Unlock()
	if fn != nil {
		fn(name)
	}
}

// Changed reports that the tenant's data changed, so any job may be due
// earlier than it said.
func (s *Signal) Changed() {
	if s == nil {
		return
	}
	s.mu.Lock()
	s.count++
	fn := s.changed
	s.mu.Unlock()
	if fn != nil {
		fn()
	}
}

// Count is the number of wake-ups and changes so far (Upkeep compares it).
func (s *Signal) Count() uint64 {
	if s == nil {
		return 0
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.count
}

// Attach routes the wake-ups to wake and changed until the returned detach is
// called. Either may be nil.
func (s *Signal) Attach(wake func(name string), changed func()) (detach func()) {
	s.mu.Lock()
	s.wake, s.changed = wake, changed
	s.mu.Unlock()
	return func() {
		s.mu.Lock()
		s.wake, s.changed = nil, nil
		s.mu.Unlock()
	}
}

// Upkeep schedules maintenance that is only needed after something changed
// (vacuuming statistics, trimming logs to their size limit, sweeping orphaned
// secrets): it is due Every after its last run, and only once the Signal saw a
// wake-up or a change since then. An idle tenant therefore has no upkeep due,
// and a host never opens one for it.
type Upkeep struct {
	Every  time.Duration
	Signal *Signal

	mu   sync.Mutex
	last time.Time
	seen uint64
}

// NewUpkeep starts the period at now with no change seen.
func NewUpkeep(every time.Duration, sig *Signal, now time.Time) *Upkeep {
	return &Upkeep{Every: every, Signal: sig, last: now, seen: sig.Count()}
}

// Next is when upkeep is due; ok is false while nothing changed since the last run.
func (u *Upkeep) Next() (time.Time, bool) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.Signal.Count() == u.seen {
		return time.Time{}, false
	}
	return u.last.Add(u.Every), true
}

// Due reports whether upkeep is due at now.
func (u *Upkeep) Due(now time.Time) bool {
	at, ok := u.Next()
	return ok && !now.Before(at)
}

// Ran records an upkeep run at now: changes seen until now are covered.
func (u *Upkeep) Ran(now time.Time) {
	u.mu.Lock()
	u.last, u.seen = now, u.Signal.Count()
	u.mu.Unlock()
}

// Earliest returns the earliest of the given next-due results; ok is false when
// none has a time. The first error is returned.
func Earliest(ctx context.Context, fns ...func(context.Context) (time.Time, bool, error)) (time.Time, bool, error) {
	var at time.Time
	for _, f := range fns {
		t, ok, err := f(ctx)
		if err != nil {
			return time.Time{}, false, err
		}
		if ok && (at.IsZero() || t.Before(at)) {
			at = t
		}
	}
	return at, !at.IsZero(), nil
}
