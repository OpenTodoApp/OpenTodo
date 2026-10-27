package tenant

import (
	"context"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/deliveryq"
	"github.com/OpenTodoApp/opentodo/internal/jobs"
	"github.com/OpenTodoApp/opentodo/internal/push"
	"github.com/OpenTodoApp/opentodo/internal/store"
)

// Timing of the tenant's jobs that is not a jobs default (design D1, D4).
const (
	// calendarsCheck matches the calendar sync ticker it replaced.
	calendarsCheck = 15 * time.Second
	// upkeepEvery spaces upkeep runs, and only after a change (jobs.Upkeep).
	upkeepEvery = time.Hour
	// housekeepingRetry: a deadline still past after a run (an item the purge
	// cannot remove) waits the old hourly pace.
	housekeepingRetry = time.Hour
	// writesEvery is how often the jobs leader looks for other processes' writes.
	writesEvery = time.Second
)

// Jobs is the tenant's background work (OpenSpec change `one-job-model`):
// built once when the tenant opens, run by StartJobs on a self-hosted server
// and by the shared scheduler on a host. Which jobs exist depends on the
// configuration (a demo instance has no outbound jobs); owner switches are
// checked by each job's Next and Run.
func (t *Tenant) Jobs() []jobs.Job { return t.jobs }

func (t *Tenant) buildJobs() []jobs.Job {
	var list []jobs.Job
	if t.Push != nil {
		list = append(list, jobs.Job{Name: jobs.Reminders, Next: t.Push.NextDue, Run: t.reminders, Retry: push.RetryPause})
	}
	if !t.Cfg.Demo {
		// No backups and no outbound requests on a demo instance.
		list = append(list,
			jobs.Job{Name: jobs.Backup, Next: t.nextBackup, Run: t.Backups.RunIfDue},
			jobs.Job{Name: jobs.Webhooks, Next: t.nextDelivery, Run: t.deliver, Retry: deliveryq.Retry},
			jobs.Job{Name: jobs.Calendars, Next: t.nextCalendars, Run: t.calendars, Check: calendarsCheck},
			jobs.Job{Name: jobs.Issues, Next: t.nextIssues, Run: t.Issues.RunOnce})
	}
	if t.Digest != nil {
		list = append(list, jobs.Job{Name: jobs.Digest, Next: t.Digest.NextDue, Run: t.digest})
	}
	if t.Rules != nil {
		list = append(list, jobs.Job{Name: jobs.Rules, Next: t.Rules.NextDue, Run: t.Rules.RunOnce})
	}
	list = append(list, jobs.Job{Name: jobs.Housekeeping, Next: t.nextHousekeeping, Run: t.housekeeping, Retry: housekeepingRetry})
	if p := t.Email.Poller(); p != nil {
		list = append(list, jobs.Job{Name: jobs.Email, Run: p.Tick, Retry: p.Interval(),
			Next: func(context.Context) (time.Time, bool, error) { return p.Next(), true, nil }})
	}
	if t.Demo != nil {
		list = append(list, jobs.Job{Name: jobs.Demo, Next: t.Demo.NextDue, Run: t.Demo.RunDue})
	}
	return list
}

func (t *Tenant) reminders(ctx context.Context) {
	if n, err := t.Push.Tick(ctx); err != nil {
		if ctx.Err() == nil {
			t.log.Error("reminder scheduler", "err", err)
		}
	} else if n > 0 {
		t.log.Debug("reminders delivered", "count", n)
	}
}

func (t *Tenant) digest(ctx context.Context) {
	if n, err := t.Digest.Tick(ctx); err != nil {
		if ctx.Err() == nil {
			t.log.Error("digest scheduler", "err", err)
		}
	} else if n > 0 {
		t.log.Info("weekly digests sent", "count", n)
	}
}

func (t *Tenant) nextBackup(ctx context.Context) (time.Time, bool, error) {
	at, err := t.Backups.NextRun(ctx)
	if err != nil || at == nil {
		return time.Time{}, false, err
	}
	return *at, true, nil
}

// nextDelivery is the earliest queued webhook delivery or channel message
// (channels only while their owner switch is on).
func (t *Tenant) nextDelivery(ctx context.Context) (time.Time, bool, error) {
	if t.Channels == nil {
		return t.Hooks.NextDue(ctx)
	}
	return jobs.Earliest(ctx, t.Hooks.NextDue, t.Channels.NextDue)
}

// deliver sends what is due in both queues, a bounded number of passes each.
func (t *Tenant) deliver(ctx context.Context) {
	deliveryq.Drain(ctx, t.Hooks.ProcessDue)
	if t.Channels != nil && t.Channels.On(ctx) {
		deliveryq.Drain(ctx, t.Channels.ProcessDue)
	}
}

// nextCalendars is the earliest subscription fetch (while calendar feeds are
// on) or calendar sync cycle (while calendar sync is on).
func (t *Tenant) nextCalendars(ctx context.Context) (time.Time, bool, error) {
	feeds := func(ctx context.Context) (time.Time, bool, error) {
		if t.Calendar.Enabled != nil && !t.Calendar.Enabled(ctx) {
			return time.Time{}, false, nil
		}
		return t.Calendar.Store.NextFetch(ctx)
	}
	return jobs.Earliest(ctx, feeds, t.CalSync.NextDue)
}

func (t *Tenant) calendars(ctx context.Context) {
	t.Calendar.RunOnce(ctx)
	t.CalSync.RunOnce(ctx)
}

// nextIssues is the earliest issue poll, only while the owner switch is on: a
// host never opens a tenant with it off for it.
func (t *Tenant) nextIssues(ctx context.Context) (time.Time, bool, error) {
	if t.Issues.Enabled == nil || !t.Issues.Enabled(ctx) {
		return time.Time{}, false, nil
	}
	return t.Issues.Store.NextPoll(ctx)
}

// nextHousekeeping is the first retention deadline (Trash, audit log, expired
// sign-ups, delivery logs, read notifications) or the upkeep time (design D4).
func (t *Tenant) nextHousekeeping(ctx context.Context) (time.Time, bool, error) {
	upkeep := func(context.Context) (time.Time, bool, error) {
		at, ok := t.upkeep.Next()
		return at, ok, nil
	}
	retention := func(ctx context.Context) (time.Time, bool, error) {
		return t.Sync.NextRetention(ctx, t.Cfg.TrashRetentionDays)
	}
	channels := func(ctx context.Context) (time.Time, bool, error) {
		if t.Channels == nil {
			return time.Time{}, false, nil
		}
		return t.Channels.NextPrune(ctx)
	}
	return jobs.Earliest(ctx, retention, t.Auth.Audit().NextPrune, t.Auth.NextSignupExpiry, t.Hooks.NextPrune, channels,
		t.Inbox.NextSweep, upkeep)
}

// housekeeping applies every retention; upkeep (the rule run log, orphaned
// secrets, query planner statistics) runs only when it is due.
func (t *Tenant) housekeeping(ctx context.Context) {
	log := t.log
	if res, err := t.Sync.RetentionPass(ctx, t.Cfg.TrashRetentionDays); err != nil {
		log.Error("trash retention failed", "err", err)
	} else if res.Tasks+res.Projects+res.Attachments+res.Orphans > 0 {
		log.Info("trash retention purged items", "tasks", res.Tasks, "projects", res.Projects, "attachments", res.Attachments,
			"orphan_files", res.Orphans, "days", t.Cfg.TrashRetentionDays)
	}
	if n, err := t.Auth.Audit().Prune(ctx); err != nil {
		log.Error("audit: prune failed", "err", err)
	} else if n > 0 {
		log.Info("audit: pruned expired events", "count", n)
	}
	if _, err := t.Auth.PruneSignups(ctx); err != nil {
		log.Error("prune failed", "err", err)
	}
	// Expired membership invitations, declined ones included (member-add-consent).
	if _, err := t.Auth.PruneMemberInvitations(ctx); err != nil {
		log.Error("prune membership invitations failed", "err", err)
	}
	if n, err := t.Inbox.Sweep(ctx); err != nil {
		log.Warn("notification sweep failed", "err", err)
	} else if n > 0 {
		log.Info("old notifications removed", "count", n)
	}
	if err := t.Hooks.Prune(ctx); err != nil {
		log.Error("webhooks: prune failed", "err", err)
	}
	if t.Channels != nil {
		if err := t.Channels.Prune(ctx); err != nil {
			log.Error("notification channels: prune failed", "err", err)
		}
	}
	if now := t.now(); t.upkeep.Due(now) {
		t.upkeep.Ran(now)
		t.runUpkeep(ctx)
	}
}

func (t *Tenant) runUpkeep(ctx context.Context) {
	log := t.log
	if t.Rules != nil {
		if _, err := t.Rules.Store.Prune(ctx); err != nil {
			log.Error("rules: prune runs", "err", err)
		}
	}
	if t.Channels != nil {
		if _, err := t.Channels.SweepSecrets(ctx); err != nil {
			log.Error("notification channels: sweep secrets", "err", err)
		}
	}
	if _, err := t.Issues.Tokens.Sweep(ctx, t.Issues.Store); err != nil {
		log.Error("issue connections: sweep tokens", "err", err)
	}
	if _, err := t.CalSync.Secrets.Sweep(ctx, t.CalSync.Store); err != nil {
		log.Error("calendar sync: sweep secrets", "err", err)
	}
	if err := store.Optimize(ctx, t.DB); err != nil {
		log.Warn("database optimize failed", "err", err)
	}
}

// writesJob is the jobs leader's probe for writes by another process on the
// same data directory (a rolling update; design D3): SQLite's data_version on
// the writer connection changes only when another connection committed, and a
// change counts as a data change, so every job is asked again.
func (t *Tenant) writesJob() jobs.Job {
	var last time.Time
	version := int64(-1)
	return jobs.Job{Name: jobs.Writes,
		Next: func(context.Context) (time.Time, bool, error) { return last.Add(writesEvery), true, nil },
		Run: func(ctx context.Context) {
			last = t.now()
			v, err := store.DataVersion(ctx, t.DB)
			if err != nil {
				if ctx.Err() == nil {
					t.log.Warn("background jobs: data version", "err", err)
				}
				return
			}
			if version >= 0 && v != version {
				t.Signal.Changed()
			}
			version = v
		}}
}
