// Package tenant builds one OpenTodo server around one data directory: the
// database and its lock, the services, the notifier, the HTTP handler and the
// background jobs (OpenSpec `multi-tenant-host`, design D1). A self-hosted
// server opens exactly one tenant; a host (internal/host) opens many, lazily.
package tenant

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/backup"
	"github.com/OpenTodoApp/opentodo/internal/config"
	"github.com/OpenTodoApp/opentodo/internal/demo"
	"github.com/OpenTodoApp/opentodo/internal/httpapi"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	"github.com/OpenTodoApp/opentodo/internal/push"
	"github.com/OpenTodoApp/opentodo/internal/store"
	"github.com/OpenTodoApp/opentodo/internal/tenant/services"
	"github.com/OpenTodoApp/opentodo/internal/web"
)

// Options configure Open.
type Options struct {
	Version string
	Log     *slog.Logger
	// Restart is called when a restore confirmed in the web app needs the
	// tenant to be closed and opened again (backup-restore-web D1). A
	// self-hosted server re-executes itself; a host closes the tenant so the
	// next request reopens it and applies the restore.
	Restart func()
	// Hosted is set when a host serves this tenant (multi-tenant-host D2, D4):
	// operator-level settings come from the host, the background jobs run in the
	// host's shared scheduler and the tenant's limits apply.
	Hosted *Hosted
	// Web serves the embedded app; nil builds the default handler.
	Web http.Handler
	// PushOptions adjusts web push before it is built (tests point it at a
	// fake push service).
	PushOptions func(*push.Options)
	// Now is the clock of the weekly digest and issue polls (a host passes its own, tests a fake
	// one); nil is time.Now.
	Now func() time.Time
}

// Hosted is what a host passes to each of its tenants (services.Hosted).
type Hosted = services.Hosted

// Tenant is one open data directory and everything built around it: the
// services (services.Set, built by services.Build) and the HTTP handler over
// them.
type Tenant struct {
	*services.Set
	DB      *sql.DB
	Reader  *sql.DB // query-only pool for pure reads (store.OpenReader)
	Handler http.Handler

	log       *slog.Logger
	hosted    *Hosted
	unlock    func()
	closeOnce sync.Once
	closeErr  error
}

// Open applies a pending web restore, takes the data directory's shared lock,
// opens and migrates the database and wires every service and the HTTP
// handler for cfg.DataDir. It starts no background job: a self-hosted server
// calls StartJobs once it leads the jobs, a host runs them through its shared
// scheduler. Close releases everything.
func Open(ctx context.Context, cfg config.Config, o Options) (t *Tenant, err error) {
	log := o.Log
	if log == nil {
		log = slog.Default()
	}
	// A restore confirmed in the web app is applied before the database opens. A
	// failure is recorded and the tenant opens on the previous database.
	if err := backup.ApplyPendingRestore(cfg.DataDir, log, nil); err != nil {
		log.Error("restore: could not record the outcome", "err", err)
	}
	// Hold the data directory shared for the life of the tenant: `opentodo
	// restore` and the other maintenance commands refuse to touch it while it is
	// open, but a newer server may open it beside us (rolling updates).
	unlock, err := store.LockShared(cfg.DataDir)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", cfg.DataDir, err)
	}
	db, err := store.Open(cfg.DataDir)
	if err != nil {
		unlock()
		return nil, err
	}
	t = &Tenant{DB: db, log: log, hosted: o.Hosted, unlock: unlock}
	defer func() {
		if err != nil {
			t.Close()
			t = nil
		}
	}()
	if t.Reader, err = store.OpenReader(cfg.DataDir); err != nil {
		return nil, err
	}
	if err := t.wire(ctx, cfg, o); err != nil {
		return nil, err
	}
	return t, nil
}

// wire builds every service of the tenant and its HTTP handler. Nothing is
// stored on t until everything was built, so a failure leaves t as Open made it.
func (t *Tenant) wire(ctx context.Context, cfg config.Config, o Options) error {
	set, err := services.Build(ctx, cfg, t.DB, t.Reader, services.Options{Version: o.Version, Log: t.log, Restart: o.Restart,
		Hosted: o.Hosted, PushOptions: o.PushOptions, Now: o.Now})
	if err != nil {
		return err
	}
	webHandler := o.Web
	if webHandler == nil {
		// A demo page also tells search engines not to index it (demo-sandboxes D5).
		webHandler = web.HandlerWith(web.Options{NoIndex: set.Cfg.Demo})
	}
	t.Handler = httpapi.New(set, webHandler)
	t.Set = set
	return nil
}

// StartJobs starts the background jobs of a self-hosted server. They stop when
// ctx is cancelled or stop is called; stop cancels them and returns once every
// goroutine StartJobs started (and any backup in progress) has finished, so
// the database can be closed after it (reliable-background-jobs). A delivery
// or send in progress records its outcome first; each is bounded by its own
// timeout.
func (t *Tenant) StartJobs(ctx context.Context, demoSignal func(context.Context, *demo.Service)) (stop func()) {
	cfg := t.Cfg
	ctx, cancel := context.WithCancel(ctx)
	var wg sync.WaitGroup
	spawn := func(f func(context.Context)) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			f(ctx)
		}()
	}
	// Prune audit events past the owner's retention at startup and hourly.
	// Expired pending sign-ups (outgoing-email) go on the same tick.
	t.Auth.Audit().AlsoPrune(t.Auth.PruneSignups)
	spawn(func(ctx context.Context) { t.Auth.Audit().RunPruner(ctx, audit.PruneInterval) })
	// Read notifications past the 90-day retention: swept on open and daily.
	spawn(func(ctx context.Context) { t.Inbox.RunSweeper(ctx, notify.SweepInterval) })
	if !cfg.Demo {
		// The backup service counts its own goroutines (scheduler, restore
		// housekeeping, a run started from the web app); stop waits for them.
		t.Backups.Start(ctx)
	}
	if t.Push != nil {
		spawn(t.Push.Run)
	}
	if t.Digest != nil {
		// Weekly digests: a pass every 5 minutes; it sends nothing while
		// outgoing email is not configured.
		spawn(t.Digest.Run)
	}
	if t.Demo != nil {
		// Expired-sandbox cleanup every 5 minutes and the nightly reset.
		spawn(t.Demo.Run)
		if demoSignal != nil {
			// The operator (or a test) can force a reset with SIGUSR1; there is no route.
			spawn(func(ctx context.Context) { demoSignal(ctx, t.Demo) })
		}
	} else {
		spawn(t.Email.Run)
	}
	// Purge items that outlived the Trash retention at startup and daily
	// (OPENTODO_TRASH_RETENTION_DAYS, default 30, 0 disables; docs/sync.md).
	spawn(func(ctx context.Context) { t.Sync.RunRetention(ctx, cfg.TrashRetentionDays, t.log) })
	// Query planner statistics: refreshed on open and daily (database-concurrency).
	spawn(func(ctx context.Context) { store.RunOptimizer(ctx, t.DB, store.OptimizeInterval, t.log) })
	if !cfg.Demo {
		// No outbound calendar fetches on a demo instance.
		spawn(t.Calendar.Run)
		// No outbound issue polls on a demo instance.
		spawn(t.Issues.Run)
		// No calendar sync on a demo instance.
		spawn(t.CalSync.Run)
		// No outbound webhook deliveries on a demo instance.
		spawn(t.Hooks.Run)
	}
	if t.Channels != nil {
		// Notification channels: one worker; nil (and silent) on a demo instance.
		spawn(t.Channels.Run)
	}
	if t.Rules != nil {
		// Automation rules: the queue, the minute scheduler and the run log
		// pruning; nothing on a demo instance (t.Rules is nil there).
		spawn(t.Rules.Run)
	}
	return func() {
		cancel()
		wg.Wait()
		if !cfg.Demo {
			t.Backups.Stop()
		}
	}
}

// Hosted reports the host's settings for this tenant; nil when self-hosted.
func (t *Tenant) Hosted() *Hosted { return t.hosted }

// Close stops the backup service, ends live event streams, closes the database and releases the data
// directory. It is safe to call more than once.
func (t *Tenant) Close() error {
	t.closeOnce.Do(func() {
		// A backup started from the web app runs even where this process does
		// not lead the jobs: cancel it and wait for its outcome first.
		if t.Set != nil {
			t.Backups.Stop()
			t.Sync.Notifier().CloseAll()
		}
		if t.Reader != nil {
			t.Reader.Close()
		}
		if t.DB != nil {
			t.closeErr = t.DB.Close()
		}
		if t.unlock != nil {
			t.unlock()
		}
		if t.hosted != nil && t.hosted.OnClose != nil {
			t.hosted.OnClose()
		}
	})
	return t.closeErr
}
