package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"

	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/backup"
	"github.com/OpenTodoApp/opentodo/internal/calsync"
	"github.com/OpenTodoApp/opentodo/internal/channels"
	"github.com/OpenTodoApp/opentodo/internal/config"
	"github.com/OpenTodoApp/opentodo/internal/demo"
	"github.com/OpenTodoApp/opentodo/internal/digest"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/email"
	"github.com/OpenTodoApp/opentodo/internal/mail"
	"github.com/OpenTodoApp/opentodo/internal/mcp"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	"github.com/OpenTodoApp/opentodo/internal/push"
	"github.com/OpenTodoApp/opentodo/internal/rules"
	"github.com/OpenTodoApp/opentodo/internal/settings"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/webhook"
)

// The builders of the services internal/tenant built before (moved unchanged).

// wireWebhooks builds outbound webhooks: events come from the winning changes
// of each committed sync batch; the worker sends queued deliveries until
// shutdown. On a host it also installs the tenant's limits and the host's
// change callback.
func wireWebhooks(ctx context.Context, cfg config.Config, o Options, db *sql.DB, authSvc *auth.Service, syncSvc *opsync.Service, log *slog.Logger) (*webhook.Service, error) {
	hosted := o.Hosted
	wo := webhook.Options{Version: o.Version, Log: log}
	if o.WebhookOptions != nil {
		o.WebhookOptions(&wo)
	}
	hooks := webhook.New(db, syncSvc, wo)
	if hosted == nil {
		if err := hooks.SeedAllowPrivate(ctx, cfg.WebhooksAllowPrivate); err != nil {
			return nil, err
		}
		return hooks, nil
	}
	// A host's private network is the operator's (multi-tenant-host D4):
	// tenants never deliver to it, whatever was stored before.
	if err := hooks.SetAllowPrivate(ctx, false); err != nil {
		return nil, err
	}
	authSvc.SetMemberLimit(hosted.MaxMembers)
	syncSvc.SetQuota(hosted.Quota)
	syncSvc.SetWorkspaceLimits(hosted.Workspaces)
	return hooks, nil
}

// wireObserver installs the post-commit observer: webhooks first, then the
// automation rules (automation-rules D5), then calendar sync's debounced
// trigger (calendar-two-way D9), then a host's change callback.
func wireObserver(syncSvc *opsync.Service, hooks *webhook.Service, engine *rules.Engine, hosted *Hosted, cal *calsync.Worker) {
	var changed func()
	if hosted != nil {
		changed = hosted.Changed
	}
	syncSvc.SetObserver(func(ctx context.Context, changes []opsync.Change) {
		hooks.Observe(ctx, changes)
		if engine != nil {
			engine.Observe(ctx, changes)
		}
		if cal != nil {
			cal.Observe(ctx, changes)
		}
		if changed != nil {
			changed()
		}
	})
}

// openRules builds the automation rules engine (automation-rules): the owner
// switch with its OPENTODO_AUTOMATIONS override, in-app notifications and the
// rule.fired webhook. Nothing runs on a demo instance.
func openRules(cfg config.Config, o Options, db *sql.DB, syncSvc *opsync.Service, inbox *notify.InApp, hooks *webhook.Service, log *slog.Logger) (*rules.Engine, *settings.Switch) {
	sw := rules.NewSwitch(db, cfg.Automations)
	if cfg.Demo {
		return nil, sw
	}
	engine := rules.New(db, syncSvc, log)
	if o.Now != nil {
		engine.SetClock(o.Now)
	}
	engine.Enabled = sw.On
	engine.Notify = inbox
	engine.Webhook = func(ctx context.Context, userID, webhookID string, f rules.Fired) error {
		err := hooks.QueueRuleFired(ctx, userID, webhookID, webhook.RuleRef{ID: f.RuleID, Name: f.RuleName}, f.TaskID, f.Changes)
		if errors.Is(err, webhook.ErrNoWebhook) {
			return rules.ErrWebhookMissing
		}
		return err
	}
	return engine, sw
}

// openInbox builds in-app notifications (task-assignment): assignment events
// land in the notifications table after commit. Old read rows are swept on open.
func openInbox(ctx context.Context, db *sql.DB, syncSvc *opsync.Service, log *slog.Logger) *notify.InApp {
	inbox := notify.NewInApp(db, log)
	syncSvc.AddSink(inbox)
	if n, err := inbox.Sweep(ctx); err != nil {
		log.Warn("notification sweep failed", "err", err)
	} else if n > 0 {
		log.Info("old notifications removed", "count", n)
	}
	return inbox
}

// openChannels builds notification channels (notification-channels): a sink
// for in-app events and a consumer of the reminder scheduler, sending through
// the webhooks' private-network policy. Nil on a demo instance: nothing is ever
// sent there, and the routes are refused.
func openChannels(ctx context.Context, cfg config.Config, o Options, db *sql.DB, syncSvc *opsync.Service, pushSvc *push.Service, hooks *webhook.Service, log *slog.Logger) *channels.Service {
	if cfg.Demo {
		return nil
	}
	origin := ""
	if cfg.BaseURL != nil {
		origin = cfg.BaseURL.Scheme + "://" + cfg.BaseURL.Host
	}
	keys := e2ee.NewStore(db)
	svc := channels.New(db, cfg.DataDir, channels.Options{Version: o.Version, Log: log, Now: o.Now, AllowPrivate: hooks.AllowPrivate,
		Encrypted: keys.Enabled, BaseOrigin: origin})
	syncSvc.AddSink(svc)
	if pushSvc != nil {
		pushSvc.SetReminderHook(func(ctx context.Context, r push.DueReminder) {
			svc.Reminder(ctx, channels.Reminder{UserID: r.UserID, ID: r.ID, TaskID: r.TaskID, FireAt: r.FireAt, Title: r.Title})
		})
	}
	if n, err := svc.SweepSecrets(ctx); err != nil {
		log.Warn("notification channels: sweep secrets", "err", err)
	} else if n > 0 {
		log.Info("notification channels: secrets of deleted channels removed", "count", n)
	}
	return svc
}

// openBackups builds scheduled backups (docs/backups.md): off until the owner
// configures them, or seeded once from OPENTODO_BACKUP_*.
func openBackups(ctx context.Context, cfg config.Config, o Options, db *sql.DB, authSvc *auth.Service, log *slog.Logger) (*backup.Service, error) {
	backups := backup.New(db, cfg.DataDir, backup.Options{Version: o.Version, Log: log, Audit: authSvc.Audit()})
	if o.Restart != nil {
		backups.SetRestartFunc(o.Restart)
	}
	if !cfg.Demo {
		if seeded, err := backups.ApplyPreset(ctx, cfg.Backup); err != nil {
			return nil, err
		} else if seeded {
			log.Info("backup settings seeded from OPENTODO_BACKUP_* variables")
		}
	}
	return backups, nil
}

// openMCPSettings builds the MCP endpoint's settings (docs/mcp.md): off until
// the owner enables it; OPENTODO_MCP presets the toggle and OPENTODO_MCP_WRITES
// the "AI assistants may make changes" switch, on first start only. On a host
// both are the operator's and are applied on every open.
func openMCPSettings(ctx context.Context, cfg config.Config, hosted *Hosted, db *sql.DB, log *slog.Logger) (*mcp.Settings, error) {
	mcpSettings := mcp.NewSettings(db)
	if hosted != nil {
		if err := mcpSettings.Set(ctx, "", cfg.MCP != nil && *cfg.MCP, nil); err != nil {
			return nil, err
		}
		if err := mcpSettings.SetWrites(ctx, "", cfg.MCPWrites != nil && *cfg.MCPWrites, nil); err != nil {
			return nil, err
		}
		return mcpSettings, nil
	}
	if seeded, err := mcpSettings.Seed(ctx, cfg.MCP); err != nil {
		return nil, err
	} else if seeded {
		log.Info("MCP setting seeded from OPENTODO_MCP", "enabled", *cfg.MCP)
	}
	if seeded, err := mcpSettings.SeedWrites(ctx, cfg.MCPWrites); err != nil {
		return nil, err
	} else if seeded {
		log.Info("MCP writes setting seeded from OPENTODO_MCP_WRITES", "enabled", *cfg.MCPWrites)
	}
	return mcpSettings, nil
}

// openPush builds reminders' web push to subscribed devices
// (docs/reminders.md). On unless OPENTODO_PUSH=off (nil then); the VAPID key
// pair is created under the data directory on first use. In-app reminders work
// either way.
func openPush(cfg config.Config, o Options, db *sql.DB, syncSvc *opsync.Service, log *slog.Logger) *push.Service {
	if cfg.PushDisabled {
		return nil
	}
	subject := cfg.Origin()
	if o.Hosted != nil {
		subject = o.Hosted.PushSubject
	}
	po := push.Options{Log: log, Subject: subject}
	if o.PushOptions != nil {
		o.PushOptions(&po)
	}
	return push.New(db, syncSvc, cfg.DataDir, po)
}

// openMail builds outgoing email (docs/self-hosting/outgoing-email.md): never
// on a demo instance (both nil then); otherwise configured in Settings or by
// OPENTODO_SMTP_* (on a host, only by the operator's OPENTODO_SMTP_*). The
// weekly digest (stats-and-review) rides on it: each user opts in for
// themselves, on a host too, and it sends nothing while outgoing email is not
// configured.
func openMail(cfg config.Config, o Options, db *sql.DB, authSvc *auth.Service, syncSvc *opsync.Service, log *slog.Logger) (*mail.Service, *digest.Service) {
	if cfg.Demo {
		return nil, nil
	}
	ehlo := ""
	if cfg.BaseURL != nil {
		ehlo = cfg.BaseURL.Hostname()
	}
	mailSvc := mail.New(settings.New(db), cfg.DataDir, mail.Options{Env: cfg.SMTP, Audit: authSvc.Audit(), Log: log,
		E2EE: e2ee.NewStore(db), Transport: &mail.Transport{LocalName: ehlo}})
	digestSvc := digest.New(db, syncSvc, mailSvc, digest.Options{Origin: cfg.Origin(), Log: log, Now: o.Now})
	return mailSvc, digestSvc
}

// startDemo, on a demo instance only (nil otherwise), provisions the hidden
// owner, drops the shared accounts of the first demo version and catches up on
// a missed nightly reset before serving.
func startDemo(ctx context.Context, cfg config.Config, authSvc *auth.Service, syncSvc *opsync.Service, log *slog.Logger) (*demo.Service, error) {
	if !cfg.Demo {
		return nil, nil
	}
	demoSvc := demo.New(authSvc, syncSvc, log)
	demoSvc.SetLimits(cfg.DemoMaxSandboxes, cfg.DemoMaxDBMB)
	if err := demoSvc.Start(ctx); err != nil {
		return nil, fmt.Errorf("demo mode: %w", err)
	}
	log.Warn("demo mode is on: every visitor gets a private sandbox, deleted after inactivity and every night", "reset_hour_utc", demo.ResetHour)
	return demoSvc, nil
}

// openEmail builds email to task (docs/email.md): off unless OPENTODO_EMAIL_*
// configure a mailbox; then one goroutine polls it over IMAP. A host has no
// per-tenant mailbox, so the feature stays off there.
func openEmail(cfg config.Config, o Options, db *sql.DB, authSvc *auth.Service, syncSvc *opsync.Service, log *slog.Logger) *email.Service {
	emailCfg := cfg.Email
	if o.Hosted != nil {
		emailCfg = config.EmailConfig{}
	}
	return email.New(db, syncSvc, emailCfg, email.Options{Log: log, Audit: authSvc.Audit()})
}
