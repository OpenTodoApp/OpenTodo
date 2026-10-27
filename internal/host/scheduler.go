package host

import (
	"context"
	"fmt"
	"slices"
	"sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/jobs"
	"github.com/OpenTodoApp/opentodo/internal/tenant"
)

// The kinds of the "next due" index (design D3) are the names of the
// tenant's jobs (tenant.Jobs, internal/jobs): a self-hosted server runs the
// same jobs with jobs.Runner.

// Scheduler tuning.
const (
	// schedulerMax is the longest the scheduler sleeps; open tenants' entries
	// are refreshed at least this often, like a self-hosted runner asks its
	// jobs (jobs.CheckEvery).
	schedulerMax = jobs.CheckEvery
	// schedulerMin is the shortest sleep, and the debounce after a change.
	schedulerMin = time.Second
	// tenantsPerPass and passConcurrency bound one pass of the scheduler.
	tenantsPerPass  = 64
	passConcurrency = 4
)

// markDirty notes that an open tenant changed, so its entries are refreshed
// on the next pass (design D3: "written by tenants on change").
func (h *Host) markDirty(name string) {
	h.dirtyMu.Lock()
	h.dirty[name] = true
	h.dirtyMu.Unlock()
	select {
	case h.wake <- struct{}{}:
	default:
	}
}

// computeDue asks an open tenant when each of its jobs is next due.
func (h *Host) computeDue(ctx context.Context, t *tenant.Tenant) (map[string]time.Time, error) {
	due := map[string]time.Time{}
	for _, j := range t.Jobs() {
		at, ok, err := j.Next(ctx)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", j.Name, err)
		}
		if ok {
			due[j.Name] = at
		}
	}
	return due, nil
}

// refreshDue rewrites a tenant's entries. ran are jobs that just ran: one
// still due afterwards (a transient failure, an unreachable destination, a
// backlog) waits its retry pause instead of running again at once.
func (h *Host) refreshDue(ctx context.Context, name string, t *tenant.Tenant, ran []string) {
	due, err := h.computeDue(ctx, t)
	if err != nil {
		h.log.Error("scheduler: next due", "tenant", name, "err", err)
		return
	}
	now := h.now()
	for _, j := range t.Jobs() {
		if at, ok := due[j.Name]; ok && !at.After(now) && slices.Contains(ran, j.Name) {
			due[j.Name] = now.Add(j.RetryInterval())
		}
	}
	if err := h.reg.SetDue(ctx, name, due); err != nil {
		h.log.Error("scheduler: next due", "tenant", name, "err", err)
	}
}

// runDue runs a tenant's due jobs, the same Run a self-hosted server's runner
// calls, one after the other.
func (h *Host) runDue(ctx context.Context, name string, t *tenant.Tenant, kinds []string) {
	for _, j := range t.Jobs() {
		if slices.Contains(kinds, j.Name) {
			j.Run(ctx)
		}
	}
	h.refreshDue(ctx, name, t, kinds)
}

// tick is one pass of the scheduler: refresh the entries of open tenants that
// changed (all open ones every schedulerMax), then open only the tenants with
// work due and run it. It never looks at a tenant without due work.
func (h *Host) tick(ctx context.Context) {
	now := h.now()
	h.dirtyMu.Lock()
	names := h.dirty
	h.dirty = map[string]bool{}
	h.dirtyMu.Unlock()
	if now.Sub(h.lastFull) >= schedulerMax {
		for _, n := range h.pool.openNames() {
			names[n] = true
		}
		h.lastFull = now
	}
	for n := range names {
		if t, release, ok := h.pool.use(n); ok {
			h.refreshDue(ctx, n, t, nil)
			release()
		}
	}
	kinds, order, err := h.reg.DueBefore(ctx, now, tenantsPerPass)
	if err != nil {
		h.log.Error("scheduler", "err", err)
		return
	}
	sem := make(chan struct{}, passConcurrency)
	var wg sync.WaitGroup
	for _, name := range order {
		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer func() { <-sem; wg.Done() }()
			t, release, err := h.pool.acquire(ctx, name)
			if err != nil {
				// Unavailable or the host is full: try again later, never in a loop.
				later := map[string]time.Time{}
				for _, k := range kinds[name] {
					later[k] = now.Add(failRetry)
				}
				if err := h.reg.SetDue(ctx, name, later); err != nil {
					h.log.Error("scheduler", "tenant", name, "err", err)
				}
				return
			}
			defer release()
			h.runDue(ctx, name, t, kinds[name])
		}()
	}
	wg.Wait()
}

// RunScheduler runs the shared scheduler until ctx is done (only in the
// process that leads the background jobs). It sleeps until the earliest due
// entry, at most schedulerMax, and wakes early after a change.
func (h *Host) RunScheduler(ctx context.Context) {
	timer := time.NewTimer(0)
	defer timer.Stop()
	deadline := time.Now()
	reset := func(d time.Duration) {
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		timer.Reset(d)
		deadline = time.Now().Add(d)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-h.wake:
			// A change: refresh soon, but never postpone a pass already near.
			if time.Until(deadline) > schedulerMin {
				reset(schedulerMin)
			}
			continue
		case <-timer.C:
		}
		h.tick(ctx)
		wait := schedulerMax
		if next, ok, err := h.reg.NextDue(ctx); err == nil && ok {
			wait = min(max(next.Sub(h.now()), schedulerMin), schedulerMax)
		}
		reset(wait)
	}
}
