// Package services builds every service of one tenant around its database:
// the composition root of a server (OpenSpec `multi-tenant-host`, design D1).
// internal/tenant opens the data directory and calls Build; internal/httpapi
// receives the Set and only registers routes over it, so nothing is built or
// seeded while routes are registered. httpapi's tests build their servers
// through Build too. This package must not import httpapi.
package services

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/backup"
	"github.com/OpenTodoApp/opentodo/internal/blobs"
	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/calsync"
	"github.com/OpenTodoApp/opentodo/internal/channels"
	"github.com/OpenTodoApp/opentodo/internal/config"
	"github.com/OpenTodoApp/opentodo/internal/demo"
	"github.com/OpenTodoApp/opentodo/internal/digest"
	"github.com/OpenTodoApp/opentodo/internal/email"
	"github.com/OpenTodoApp/opentodo/internal/importer"
	"github.com/OpenTodoApp/opentodo/internal/issues"
	"github.com/OpenTodoApp/opentodo/internal/jobs"
	"github.com/OpenTodoApp/opentodo/internal/mail"
	"github.com/OpenTodoApp/opentodo/internal/maps"
	"github.com/OpenTodoApp/opentodo/internal/mcp"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	"github.com/OpenTodoApp/opentodo/internal/oidc"
	"github.com/OpenTodoApp/opentodo/internal/push"
	"github.com/OpenTodoApp/opentodo/internal/rules"
	"github.com/OpenTodoApp/opentodo/internal/settings"
	"github.com/OpenTodoApp/opentodo/internal/stt"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/webhook"
)

// Options configure Build.
type Options struct {
	Version string
	Log     *slog.Logger
	// Restart is called when a restore confirmed in the web app needs the
	// tenant to be closed and opened again (backup-restore-web D1).
	Restart func()
	// Hosted is set when a host serves this tenant (multi-tenant-host D2, D4).
	Hosted *Hosted
	// PushOptions adjusts web push before it is built (tests point it at a
	// fake push service).
	PushOptions func(*push.Options)
	// WebhookOptions adjusts webhooks before they are built (tests drive the
	// worker with their own clock).
	WebhookOptions func(*webhook.Options)
	// Now is the clock of the weekly digest, issue polls, calendar sync,
	// automations and channels (a host passes its own, tests a fake one); nil
	// is time.Now.
	Now func() time.Time
}

// Hosted is what a host passes to each of its tenants.
type Hosted struct {
	// Name is the tenant name (the first label of its host name).
	Name string
	// PushSubject is the operator's VAPID contact (a mailto: or https: URI).
	PushSubject string
	// Quota bounds the tenant's writes (multi-tenant-host D5); nil means none.
	Quota opsync.Quota
	// MaxMembers caps the tenant's accounts; 0 means no limit.
	MaxMembers int
	// Workspaces lowers the workspace limits for this tenant (workspaces "Limits").
	Workspaces opsync.WorkspaceLimits
	// Changed is called after every committed write and every wake-up of one
	// of the tenant's jobs, so the host can refresh the tenant's entries in the
	// "next due" index (D3).
	Changed func()
	// OnClose is called once the tenant has closed (the host's bookkeeping).
	OnClose func()
}

// Set is every service of one tenant.
type Set struct {
	// Cfg is the effective configuration (a demo instance turns sign-up and
	// web push off); Log and Version are Build's.
	Cfg     config.Config
	Log     *slog.Logger
	Version string
	// Hosted is the host's settings for this tenant; nil when self-hosted.
	Hosted *Hosted
	// Signal carries the services' wake-ups to whatever runs the tenant's jobs
	// (internal/jobs): the host from the start, a self-hosted server's runner
	// once this process leads the jobs, otherwise nothing.
	Signal *jobs.Signal

	Auth     *auth.Service
	Sync     *opsync.Service
	Settings *settings.Store
	Hooks    *webhook.Service
	Inbox    *notify.InApp
	Backups  *backup.Service
	MCP      *mcp.Settings
	Push     *push.Service // nil when web push is off
	Email    *email.Service
	Calendar *calfeed.Worker
	Issues   *issues.Worker    // issue connections (issue-import)
	CalSync  *calsync.Worker   // calendar sync (calendar-two-way)
	Mail     *mail.Service     // nil on a demo instance
	Digest   *digest.Service   // weekly digests (stats-and-review); nil with Mail
	Demo     *demo.Service     // nil unless OPENTODO_DEMO
	Rules    *rules.Engine     // automation rules (automation-rules); nil on a demo instance
	Channels *channels.Service // notification channels (notification-channels); nil on a demo instance
	Importer *importer.Service
	OIDC     *oidc.Service
	Blobs    *blobs.Store // attachment bytes; nil without a data directory or when unavailable
	Maps     *maps.Service
	STT      *stt.Service

	// The owner switches (settings.Switch).
	RuleSwitch    *settings.Switch
	CalDAV        *settings.Switch
	CalendarFeeds *settings.Switch
	IssuesOn      *settings.Switch
	CalendarSync  *settings.Switch
	MembersInvite *settings.Switch
	// ChannelsOn is the notification channels switch: Channels.Switch(), or a
	// switch of its own on a demo instance, which has no channel service.
	ChannelsOn *settings.Switch
}

// Build builds every service of a tenant over db (the writer) and reader (the
// query-only pool, may be nil), seeds the settings presets of cfg and wires
// the services to each other. It starts no background job.
func Build(ctx context.Context, cfg config.Config, db, reader *sql.DB, o Options) (*Set, error) {
	log := o.Log
	if log == nil {
		log = slog.Default()
	}
	if cfg.Demo {
		// Demo instance (OpenSpec `demo-mode`, docs/self-hosting/demo.md): no sign-up,
		// no web push, and none of the outbound integrations run.
		cfg.AllowSignup, cfg.PushDisabled = false, true
	}
	s := &Set{Cfg: cfg, Log: log, Version: o.Version, Hosted: o.Hosted, Settings: settings.New(db), Signal: &jobs.Signal{}}
	if h := o.Hosted; h != nil && h.Changed != nil {
		s.Signal.Attach(func(string) { h.Changed() }, h.Changed)
	}
	s.Auth = auth.NewService(db, cfg.SessionTTL, cfg.AllowSignup)
	s.Auth.SetSetupToken(cfg.SetupToken)
	s.Auth.SetSetupCodeRequired(cfg.SetupCodeRequired)
	s.Sync = opsync.NewService(db)
	if reader != nil {
		s.Sync.SetReader(reader)
	}
	var err error
	if s.Hooks, err = wireWebhooks(ctx, cfg, o, db, s.Auth, s.Sync, log); err != nil {
		return nil, err
	}
	s.Inbox = openInbox(ctx, db, s.Sync, log)
	s.Rules, s.RuleSwitch = openRules(cfg, o, db, s.Sync, s.Inbox, s.Hooks, log)
	// Calendar sync (calendar-two-way): the user's own calendar accounts, under
	// the webhooks' policy; task changes make it due soon (D9).
	s.CalSync = calsync.NewWorker(db, cfg.DataDir, s.Sync, s.Hooks.AllowPrivate, cfg.Google, o.Version, log)
	if o.Now != nil {
		s.CalSync.SetClock(o.Now)
	}
	wireObserver(s.Sync, s.Hooks, s.Rules, s.Signal, s.CalSync)
	if s.Backups, err = openBackups(ctx, cfg, o, db, s.Auth, log); err != nil {
		return nil, err
	}
	if s.MCP, err = openMCPSettings(ctx, cfg, o.Hosted, db, log); err != nil {
		return nil, err
	}
	s.Push = openPush(cfg, o, db, s.Sync, log)
	s.Channels = openChannels(ctx, cfg, o, db, s.Sync, s.Push, s.Hooks, log)
	if s.Channels != nil {
		s.ChannelsOn = s.Channels.Switch()
	} else {
		s.ChannelsOn = channels.NewSwitch(db, log)
	}
	s.Email = openEmail(cfg, o, db, s.Auth, s.Sync, log)
	// Calendar subscriptions (calendar-feeds) and issue connections
	// (issue-import), fetched under the webhooks' private-network policy.
	s.Calendar = &calfeed.Worker{Store: calfeed.NewStore(db), Fetcher: calfeed.NewFetcher(s.Hooks.AllowPrivate, o.Version), Log: log}
	s.Issues = issues.NewWorker(db, cfg.DataDir, s.Sync, s.Hooks.AllowPrivate, o.Version, log)
	if o.Now != nil {
		s.Issues.SetClock(o.Now)
	}
	s.Mail, s.Digest = openMail(cfg, o, db, s.Auth, s.Sync, log)
	if s.Demo, err = startDemo(ctx, cfg, s.Auth, s.Sync, log); err != nil {
		return nil, err
	}
	s.wireWakes()
	s.openSwitches(ctx, db)
	s.wireAccounts()
	s.openImporter()
	s.openAttachments(ctx)
	s.openMaps()
	s.STT = stt.New(s.Settings, cfg.DataDir, cfg.STT, s.Hooks.AllowPrivate)
	return s, nil
}
