package host

import (
	"context"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/tenant"
)

// Kinds of background work in the "next due" index (design D3).
const (
	KindReminders    = "reminders"    // web push of due reminders
	KindBackup       = "backup"       // a scheduled backup
	KindWebhooks     = "webhooks"     // queued webhook deliveries
	KindCalendars    = "calendars"    // calendar subscriptions to fetch
	KindHousekeeping = "housekeeping" // Trash retention, audit and log pruning
)

// Scheduler tuning.
const (
	// schedulerMax is the longest the scheduler sleeps; open tenants' entries
	// are refreshed at least this often. It matches the push tick, so a
	// reminder is pushed no later than on a self-hosted server.
	schedulerMax = 30 * time.Second
	// schedulerMin is the shortest sleep, and the debounce after a change.
	schedulerMin = time.Second
	// retryAfter pushes work that is still due after it ran (a transient push
	// failure, an unreachable destination) to a later pass.
	retryAfter = 30 * time.Second
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

// computeDue asks an open tenant when each kind of work is next due.
func (h *Host) computeDue(ctx context.Context, t *tenant.Tenant) (map[string]time.Time, error) {
	due := map[string]time.Time{}
	if t.Push != nil {
		at, ok, err := t.Push.NextDue(ctx)
		if err != nil {
			return nil, err
		}
		if ok {
			due[KindReminders] = at
		}
	}
	next, err := t.Backups.NextRun(ctx)
	if err != nil {
		return nil, err
	}
	if next != nil {
		due[KindBackup] = *next
	}
	at, ok, err := t.Hooks.NextDue(ctx)
	if err != nil {
		return nil, err
	}
	if ok {
		due[KindWebhooks] = at
	}
	if t.Calendar.Enabled == nil || t.Calendar.Enabled(ctx) {
		at, ok, err := t.Calendar.Store.NextFetch(ctx)
		if err != nil {
			return nil, err
		}
		if ok {
			due[KindCalendars] = at
		}
	}
	// Housekeeping is due when the first of its deadlines passes.
	var house time.Time
	for _, f := range []func(context.Context) (time.Time, bool, error){
		func(ctx context.Context) (time.Time, bool, error) {
			return t.Sync.NextRetention(ctx, t.Cfg.TrashRetentionDays)
		},
		t.Auth.Audit().NextPrune, t.Auth.NextSignupExpiry, t.Hooks.NextPrune,
	} {
		at, ok, err := f(ctx)
		if err != nil {
			return nil, err
		}
		if ok && (house.IsZero() || at.Before(house)) {
			house = at
		}
	}
	if !house.IsZero() {
		due[KindHousekeeping] = house
	}
	return due, nil
}

// refreshDue rewrites a tenant's entries. ran are kinds that just ran: one
// still due afterwards is retried after retryAfter instead of at once.
func (h *Host) refreshDue(ctx context.Context, name string, t *tenant.Tenant, ran []string) {
	due, err := h.computeDue(ctx, t)
	if err != nil {
		h.log.Error("scheduler: next due", "tenant", name, "err", err)
		return
	}
	now := h.now()
	for _, k := range ran {
		if at, ok := due[k]; ok && !at.After(now) {
			due[k] = now.Add(retryAfter)
		}
	}
	if err := h.reg.SetDue(ctx, name, due); err != nil {
		h.log.Error("scheduler: next due", "tenant", name, "err", err)
	}
}

// runDue runs a tenant's due work through the same code paths a self-hosted
// server's background jobs use.
func (h *Host) runDue(ctx context.Context, name string, t *tenant.Tenant, kinds []string) {
	log := h.log.With("tenant", name)
	for _, k := range kinds {
		switch k {
		case KindReminders:
			if t.Push == nil {
				continue
			}
			if n, err := t.Push.Tick(ctx); err != nil {
				log.Error("reminder scheduler", "err", err)
			} else if n > 0 {
				log.Debug("reminders delivered", "count", n)
			}
		case KindBackup:
			t.Backups.RunIfDue(ctx)
		case KindWebhooks:
			for i := 0; i < 64 && t.Hooks.ProcessDue(ctx) > 0; i++ {
			}
		case KindCalendars:
			t.Calendar.RunOnce(ctx)
		case KindHousekeeping:
			if _, err := t.Sync.RetentionPass(ctx, t.Cfg.TrashRetentionDays); err != nil {
				log.Error("trash retention failed", "err", err)
			}
			if _, err := t.Auth.Audit().Prune(ctx); err != nil {
				log.Error("audit: prune failed", "err", err)
			}
			if _, err := t.Auth.PruneSignups(ctx); err != nil {
				log.Error("prune failed", "err", err)
			}
			if err := t.Hooks.Prune(ctx); err != nil {
				log.Error("webhooks: prune failed", "err", err)
			}
			if _, err := t.Inbox.Sweep(ctx); err != nil {
				log.Warn("notification sweep failed", "err", err)
			}
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
