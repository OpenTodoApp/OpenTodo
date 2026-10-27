package jobs

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// Runner runs one tenant's jobs on a self-hosted server (design D1). Each job
// runs in its own goroutine when its next due time passes, never twice at
// once, so a long backup does not hold up a webhook delivery. Between runs the
// runner sleeps until the earliest due time, at most each job's check interval,
// and wakes early for Wake (that job is asked again now) and Changed (every job
// is asked again after Debounce).
type Runner struct {
	jobs  []Job
	clock Clock
	log   *slog.Logger

	mu      sync.Mutex
	woken   map[string]bool
	changed bool
	signal  chan struct{}

	// turn, when set (tests), is called before each sleep with the number of
	// jobs running and the time the runner is about to sleep.
	turn func(running int, wait time.Duration)
}

// NewRunner builds a runner for jobs; a nil clock is Real, a nil log the default.
func NewRunner(jobs []Job, clock Clock, log *slog.Logger) *Runner {
	if clock == nil {
		clock = Real
	}
	if log == nil {
		log = slog.Default()
	}
	return &Runner{jobs: jobs, clock: clock, log: log, woken: map[string]bool{}, signal: make(chan struct{}, 1)}
}

// Wake asks the named job for its next due time now. It never blocks.
func (r *Runner) Wake(name string) {
	r.mu.Lock()
	r.woken[name] = true
	r.mu.Unlock()
	r.poke()
}

// Changed asks every job for its next due time after Debounce. It never blocks.
func (r *Runner) Changed() {
	r.mu.Lock()
	r.changed = true
	r.mu.Unlock()
	r.poke()
}

func (r *Runner) poke() {
	select {
	case r.signal <- struct{}{}:
	default:
	}
}

// slot is the runner's view of one job.
type slot struct {
	job       Job
	due       time.Time // when it runs next; zero when it has no work
	checkAt   time.Time // when to ask Next again
	notBefore time.Time // still due after a run: not before this
	recheck   bool      // ask Next at the next turn
	running   bool
}

// Run runs the jobs until ctx ends, then waits for the runs in progress.
func (r *Runner) Run(ctx context.Context) {
	slots := make([]*slot, len(r.jobs))
	for i, j := range r.jobs {
		slots[i] = &slot{job: j, recheck: true}
	}
	done := make(chan *slot, len(slots))
	var wg sync.WaitGroup
	defer wg.Wait()
	var changeAt time.Time // when a debounced change makes every job be asked again
	for {
		now := r.clock.Now()
		woken, changed := r.take()
		for _, s := range slots {
			if woken[s.job.Name] {
				s.recheck = true
			}
		}
		if changed && changeAt.IsZero() {
			changeAt = now.Add(Debounce)
		}
		if !changeAt.IsZero() && !now.Before(changeAt) {
			for _, s := range slots {
				s.recheck = true
			}
			changeAt = time.Time{}
		}
		for _, s := range slots {
			if s.running {
				continue
			}
			if s.recheck || !now.Before(s.checkAt) {
				r.check(ctx, s, now)
			}
			if !s.due.IsZero() && !now.Before(s.due) && !now.Before(s.notBefore) {
				s.running = true
				wg.Add(1)
				go func() {
					defer wg.Done()
					s.job.Run(ctx)
					done <- s
				}()
			}
		}
		wait := r.wait(slots, changeAt, now)
		if r.turn != nil {
			n := 0
			for _, s := range slots {
				if s.running {
					n++
				}
			}
			r.turn(n, wait)
		}
		select {
		case <-ctx.Done():
			return
		case <-r.signal:
		case s := <-done:
			r.finish(ctx, s)
		case <-r.clock.After(wait):
		}
	}
}

// take returns and clears the pending wake-ups.
func (r *Runner) take() (map[string]bool, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	woken, changed := r.woken, r.changed
	r.woken, r.changed = map[string]bool{}, false
	return woken, changed
}

// check asks a job when it is next due.
func (r *Runner) check(ctx context.Context, s *slot, now time.Time) {
	s.recheck = false
	s.checkAt = now.Add(s.job.CheckInterval())
	at, ok, err := s.job.Next(ctx)
	if err != nil {
		if ctx.Err() == nil {
			r.log.Error("background job: next due", "job", s.job.Name, "err", err)
		}
		// Ask again after the retry pause, never in a loop.
		s.due, s.checkAt = time.Time{}, now.Add(s.job.RetryInterval())
		return
	}
	s.due = time.Time{}
	if ok {
		s.due = at
	}
}

// finish records the end of a run: the job is asked again, and when it is
// still due it waits its retry pause first (a transient failure, or more work
// than one run takes).
func (r *Runner) finish(ctx context.Context, s *slot) {
	s.running = false
	now := r.clock.Now()
	r.check(ctx, s, now)
	if !s.due.IsZero() && !now.Before(s.due) {
		s.notBefore = now.Add(s.job.RetryInterval())
	} else {
		s.notBefore = time.Time{}
	}
}

// wait is how long to sleep: until the earliest due run, check or debounced
// change.
func (r *Runner) wait(slots []*slot, changeAt, now time.Time) time.Duration {
	next := now.Add(CheckEvery)
	earlier := func(t time.Time) {
		if !t.IsZero() && t.Before(next) {
			next = t
		}
	}
	earlier(changeAt)
	for _, s := range slots {
		if s.running {
			continue
		}
		earlier(s.checkAt)
		if !s.due.IsZero() {
			earlier(later(s.due, s.notBefore))
		}
	}
	return max(next.Sub(now), 0)
}

func later(a, b time.Time) time.Time {
	if b.After(a) {
		return b
	}
	return a
}
