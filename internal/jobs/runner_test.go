package jobs

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

// fakeClock is a manual clock: After fires when Advance passes its deadline.
type fakeClock struct {
	mu      sync.Mutex
	now     time.Time
	waiters []waiter
}

type waiter struct {
	at time.Time
	ch chan time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) After(d time.Duration) <-chan time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	ch := make(chan time.Time, 1)
	if d <= 0 {
		ch <- c.now
		return ch
	}
	// One runner sleeps on one timer: a new sleep replaces the previous one.
	c.waiters = []waiter{{c.now.Add(d), ch}}
	return ch
}

// Advance moves the clock and reports whether it woke the sleeper.
func (c *fakeClock) Advance(d time.Duration) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
	fired := false
	kept := c.waiters[:0]
	for _, w := range c.waiters {
		if w.at.After(c.now) {
			kept = append(kept, w)
			continue
		}
		w.ch <- c.now
		fired = true
	}
	c.waiters = kept
	return fired
}

// fakeJob is a job whose next due time the test sets; Run records the time.
type fakeJob struct {
	clock *fakeClock
	mu    sync.Mutex
	due   time.Time // zero: no work
	err   error
	nexts int
	runs  []time.Time
	// block, when set, holds Run until it is closed.
	block chan struct{}
	// keep leaves the job due after a run (a transient failure).
	keep bool
}

func (j *fakeJob) next(context.Context) (time.Time, bool, error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.nexts++
	return j.due, !j.due.IsZero(), j.err
}

func (j *fakeJob) run(context.Context) {
	j.mu.Lock()
	j.runs = append(j.runs, j.clock.Now())
	if !j.keep {
		j.due = time.Time{}
	}
	block := j.block
	j.mu.Unlock()
	if block != nil {
		<-block
	}
}

func (j *fakeJob) set(due time.Time) {
	j.mu.Lock()
	j.due = due
	j.mu.Unlock()
}

func (j *fakeJob) counts() (nexts, runs int) {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.nexts, len(j.runs)
}

func (j *fakeJob) lastRun() time.Time {
	j.mu.Lock()
	defer j.mu.Unlock()
	if len(j.runs) == 0 {
		return time.Time{}
	}
	return j.runs[len(j.runs)-1]
}

// harness runs a Runner in lockstep with the test: the runner reports every
// turn before it sleeps, and the test waits for a turn with no job running.
type harness struct {
	t      *testing.T
	clock  *fakeClock
	r      *Runner
	turns  chan turn
	cancel context.CancelFunc
	done   chan struct{}
}

type turn struct {
	running int
	wait    time.Duration
}

var t0 = time.Date(2026, 10, 27, 9, 0, 0, 0, time.UTC)

func newHarness(t *testing.T) *harness {
	return &harness{t: t, clock: &fakeClock{now: t0}, turns: make(chan turn), done: make(chan struct{})}
}

// fake returns a job of the harness with the given next due time.
func (h *harness) fake(due time.Time) *fakeJob { return &fakeJob{clock: h.clock, due: due} }

func (h *harness) start(jobs ...Job) {
	t := h.t
	t.Helper()
	h.r = NewRunner(jobs, h.clock, nil)
	ctx, cancel := context.WithCancel(context.Background())
	h.cancel = cancel
	h.r.turn = func(running int, wait time.Duration) {
		select {
		case h.turns <- turn{running, wait}:
		case <-ctx.Done():
		}
	}
	go func() {
		h.r.Run(ctx)
		close(h.done)
	}()
	t.Cleanup(h.stop)
}

func (h *harness) stop() {
	h.cancel()
	<-h.done
}

// idle waits until the runner is about to sleep with no job running and
// returns how long it sleeps.
func (h *harness) idle() time.Duration {
	h.t.Helper()
	for {
		select {
		case tn := <-h.turns:
			if tn.running == 0 {
				return tn.wait
			}
		case <-time.After(5 * time.Second):
			h.t.Fatal("the runner never went idle")
		}
	}
}

// advance moves the clock and, when that woke the runner, waits for it to
// settle again.
func (h *harness) advance(d time.Duration) {
	if h.clock.Advance(d) {
		h.idle()
	}
}

func (j *fakeJob) job(name string) Job {
	return Job{Name: name, Next: j.next, Run: j.run}
}

func TestRunsAtTheDueTime(t *testing.T) {
	h := newHarness(t)
	j := &fakeJob{clock: h.clock, due: t0.Add(10 * time.Second)}
	h.start(j.job("a"))
	if wait := h.idle(); wait != 10*time.Second {
		t.Fatalf("sleeps %v, want 10s (the due time)", wait)
	}
	h.advance(9 * time.Second)
	if _, runs := j.counts(); runs != 0 {
		t.Fatal("ran before it was due")
	}
	h.advance(time.Second)
	if got := j.lastRun(); !got.Equal(t0.Add(10 * time.Second)) {
		t.Fatalf("ran at %v, want exactly the due time", got)
	}
}

// TestWakeRunsNewWorkAtOnce: a delivery queued while the runner sleeps is
// sent without waiting for any poll or check.
func TestWakeRunsNewWorkAtOnce(t *testing.T) {
	h := newHarness(t)
	j := &fakeJob{clock: h.clock}
	h.start(j.job(Webhooks))
	if wait := h.idle(); wait != CheckEvery {
		t.Fatalf("idle sleep %v, want the check interval", wait)
	}
	h.advance(7 * time.Second)
	j.set(h.clock.Now())
	h.r.Wake(Webhooks)
	h.idle()
	if got := j.lastRun(); !got.Equal(t0.Add(7 * time.Second)) {
		t.Fatalf("ran at %v, want at the wake-up (no delay)", got)
	}
}

// TestIdleRunnerDoesNotPoll: with nothing due, a job is asked again only
// every check interval.
func TestIdleRunnerDoesNotPoll(t *testing.T) {
	h := newHarness(t)
	j := &fakeJob{clock: h.clock}
	h.start(j.job("a"))
	h.idle()
	for range 10 {
		h.advance(CheckEvery)
	}
	if nexts, runs := j.counts(); nexts != 11 || runs != 0 {
		t.Fatalf("asked %d times in 5 minutes, ran %d; want 11 and 0", nexts, runs)
	}
}

// TestCheckFindsUnwokenWork: work that became due without a wake-up is found
// within the check interval.
func TestCheckFindsUnwokenWork(t *testing.T) {
	h := newHarness(t)
	j := &fakeJob{clock: h.clock}
	h.start(Job{Name: "a", Next: j.next, Run: j.run, Check: 15 * time.Second})
	h.idle()
	j.set(t0.Add(2 * time.Second))
	h.advance(14 * time.Second)
	if _, runs := j.counts(); runs != 0 {
		t.Fatal("found before the check")
	}
	h.advance(time.Second)
	if got := j.lastRun(); !got.Equal(t0.Add(15 * time.Second)) {
		t.Fatalf("ran at %v, want at the 15 s check", got)
	}
}

// TestChangedIsDebounced: data changes are gathered for a second, then every
// job is asked once.
func TestChangedIsDebounced(t *testing.T) {
	h := newHarness(t)
	a, b := h.fake(time.Time{}), h.fake(time.Time{})
	h.start(a.job("a"), b.job("b"))
	h.idle()
	for range 5 {
		h.r.Changed()
		if wait := h.idle(); wait > Debounce {
			t.Fatalf("sleeps %v after a change, want at most the debounce", wait)
		}
	}
	if n, _ := a.counts(); n != 1 {
		t.Fatalf("asked %d times before the debounce passed", n)
	}
	b.set(h.clock.Now())
	h.advance(Debounce)
	if na, _ := a.counts(); na != 2 {
		t.Fatalf("a asked %d times, want 2", na)
	}
	if _, runs := b.counts(); runs != 1 {
		t.Fatal("work found by the debounced check did not run")
	}
}

// TestStillDueWaitsForRetry: a job still due after its run (a transient
// failure) waits its retry pause, even when woken, and never spins.
func TestStillDueWaitsForRetry(t *testing.T) {
	h := newHarness(t)
	j := &fakeJob{clock: h.clock, due: t0, keep: true}
	h.start(j.job("a"))
	if wait := h.idle(); wait != RetryAfter {
		t.Fatalf("sleeps %v after a failed run, want the retry pause", wait)
	}
	h.r.Wake("a")
	h.idle()
	h.advance(RetryAfter - time.Second)
	if _, runs := j.counts(); runs != 1 {
		t.Fatalf("ran %d times within the retry pause", runs)
	}
	h.advance(time.Second)
	if _, runs := j.counts(); runs != 2 {
		t.Fatalf("ran %d times after the retry pause, want 2", runs)
	}
}

func TestRetryOverride(t *testing.T) {
	h := newHarness(t)
	j := &fakeJob{clock: h.clock, due: t0, keep: true}
	h.start(Job{Name: "a", Next: j.next, Run: j.run, Retry: time.Second})
	if wait := h.idle(); wait != time.Second {
		t.Fatalf("sleeps %v, want the job's 1 s retry", wait)
	}
}

// TestJobsRunIndependently: a long run (a backup) does not hold up another
// job, and a job is never run twice at once.
func TestJobsRunIndependently(t *testing.T) {
	h := newHarness(t)
	slow, fast := h.fake(t0), h.fake(time.Time{})
	slow.block = make(chan struct{})
	h.start(slow.job(Backup), fast.job(Webhooks))
	// The backup is running: the runner sleeps with one job running.
	tn := <-h.turns
	if tn.running != 1 {
		t.Fatalf("running %d, want the backup", tn.running)
	}
	fast.set(h.clock.Now())
	slow.set(h.clock.Now())
	h.r.Wake(Webhooks)
	h.r.Wake(Backup)
	for {
		tn = <-h.turns
		if _, runs := fast.counts(); runs == 1 && tn.running == 1 {
			break
		}
	}
	if _, runs := slow.counts(); runs != 1 {
		t.Fatalf("backup started %d times while it was running", runs)
	}
	close(slow.block)
	h.idle()
	if _, runs := slow.counts(); runs != 1 {
		t.Fatalf("backup ran %d times, want 1 (still due after a run waits)", runs)
	}
}

// TestStopWaitsForRunningJobs: Run returns only after the runs in progress.
func TestStopWaitsForRunningJobs(t *testing.T) {
	h := newHarness(t)
	j := h.fake(t0)
	j.block = make(chan struct{})
	h.start(j.job("a"))
	<-h.turns
	h.cancel()
	select {
	case <-h.done:
		t.Fatal("Run returned while a job was running")
	case <-time.After(50 * time.Millisecond):
	}
	close(j.block)
	select {
	case <-h.done:
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return after the job finished")
	}
}

func TestNextErrorRetriesLater(t *testing.T) {
	h := newHarness(t)
	j := &fakeJob{clock: h.clock, err: errors.New("database is locked")}
	h.start(j.job("a"))
	if wait := h.idle(); wait != RetryAfter {
		t.Fatalf("sleeps %v after an error, want the retry pause", wait)
	}
	j.mu.Lock()
	j.err, j.due = nil, t0
	j.mu.Unlock()
	h.advance(RetryAfter)
	if _, runs := j.counts(); runs != 1 {
		t.Fatal("not run after the error cleared")
	}
}

func TestSignal(t *testing.T) {
	var nilSig *Signal
	nilSig.Wake("a")
	nilSig.Changed()
	var s Signal
	s.Wake("dropped") // nothing attached: a process that does not lead the jobs
	var woken []string
	changes := 0
	detach := s.Attach(func(n string) { woken = append(woken, n) }, func() { changes++ })
	s.Wake(Webhooks)
	s.Changed()
	detach()
	s.Wake(Rules)
	if len(woken) != 1 || woken[0] != Webhooks || changes != 1 || s.Count() != 4 {
		t.Fatalf("woken %v, changes %d, count %d", woken, changes, s.Count())
	}
}

func TestUpkeepOnlyAfterChanges(t *testing.T) {
	var s Signal
	u := NewUpkeep(time.Hour, &s, t0)
	if _, ok := u.Next(); ok {
		t.Fatal("upkeep due on an idle tenant")
	}
	s.Changed()
	if at, ok := u.Next(); !ok || !at.Equal(t0.Add(time.Hour)) {
		t.Fatalf("next %v %v, want an hour after the start", at, ok)
	}
	if u.Due(t0.Add(59*time.Minute)) || !u.Due(t0.Add(time.Hour)) {
		t.Fatal("due at the wrong time")
	}
	u.Ran(t0.Add(time.Hour))
	if _, ok := u.Next(); ok {
		t.Fatal("upkeep due again without a change")
	}
	s.Wake(Webhooks)
	if at, _ := u.Next(); !at.Equal(t0.Add(2 * time.Hour)) {
		t.Fatalf("next %v, want an hour after the last run", at)
	}
}

func TestEarliest(t *testing.T) {
	at := func(d time.Duration, ok bool) func(context.Context) (time.Time, bool, error) {
		return func(context.Context) (time.Time, bool, error) { return t0.Add(d), ok, nil }
	}
	got, ok, err := Earliest(context.Background(), at(time.Hour, true), at(time.Minute, false), at(time.Second*30, true))
	if err != nil || !ok || !got.Equal(t0.Add(30*time.Second)) {
		t.Fatalf("earliest %v %v %v", got, ok, err)
	}
	if _, ok, _ := Earliest(context.Background(), at(0, false)); ok {
		t.Fatal("none has a time")
	}
	boom := errors.New("boom")
	if _, _, err := Earliest(context.Background(), func(context.Context) (time.Time, bool, error) { return time.Time{}, false, boom }); !errors.Is(err, boom) {
		t.Fatal("error not returned")
	}
}
