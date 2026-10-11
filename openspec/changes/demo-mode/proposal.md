# Proposal

## Why

For the launch the maintainer wants a public instance where anyone can try OpenTodo without installing it or creating an account. Running a normal instance in public would be unsafe and would look empty: visitors would need to sign up (an open sign-up is an abuse magnet), could make the server send requests anywhere (webhooks, backup destinations, push services, an OIDC issuer), lock everyone out (end-to-end encryption, two-factor, password change) or leave private data behind for the next visitor. A demo mode turns one switch into a safe, always fresh showroom.

## What Changes

- New optional environment variable `OPENTODO_DEMO=true` (off by default; nothing changes without it).
- On an empty data directory the server creates a hidden owner with a random, discarded password, plus a public demo account (`demo@example.com` / `opentodo-demo`, a plain member) and a second demo member who collaborates on a shared project.
- Realistic demo data, a port of `scripts/screenshots.mjs`, is written through the op log (`ApplyStrict`): projects with sections and a sub-project, labels, recurring tasks, subtasks, comments with a reply and a mention, a shared project with the second member, saved views and a dashboard, reminders, completed and trashed items. Dates are relative to the day of seeding.
- Nightly reset at 03:00 UTC, and at startup when the data predates the last reset time: the demo accounts' data is wiped and reseeded. Devices recover on their next sync through the existing purge markers and membership list; sessions survive.
- Abusable features answer 403 `demo_restricted` before any handler runs: sign-up, invitations, user administration and owner transfer, password change and resets, API tokens, app passwords and CalDAV, passkeys, two-factor, server settings (OIDC, MCP, CalDAV, webhooks, audit, MFA policy), backups, webhooks, email to task, import, end-to-end encryption, web push, sharing changes and the MCP endpoint. Web push, the backup scheduler, the email poller and the webhook worker do not run. Rate limits stay.
- The sign-in screen shows the credentials and a "Try the demo" button; the app shows a banner "Demo instance — data resets every night, don't store anything private."; Settings replaces the restricted sections with a short note and disables Import.

Out of scope: per-visitor sandboxes (all visitors share one demo account), a demo-specific dataset editor, analytics of demo usage (no telemetry), hosting the instance itself.

ROADMAP.md: every listed feature is already implemented; this change advances none of them and serves the launch (a public demo instance). It is recorded in the roadmap's launch notes.

No breaking changes: the new variable is optional, the op log format is unchanged, `auth/status` gains an additive `demo` field and no migration is needed.

## Capabilities

### New Capabilities
- `demo-mode`: demo accounts, seeded data, nightly reset and device recovery, restricted features, sign-in and banner.

### Modified Capabilities
- `self-hosting`: adds the optional `OPENTODO_DEMO` switch.

## Impact

- Server: new `internal/demo` package (accounts, seed, reset, scheduler), `sync.WipeAccounts`, `auth.CreateAccount` (provisioning only, no route), `internal/httpapi/demo.go` (guard and `WithDemo`), `config.Demo`, wiring in `cmd/opentodo` including `SIGUSR1` to force a reset. No new dependency, no migration.
- Client: `web/src/lib/demo.ts`, demo panel on the sign-in screen, banner, Settings gating.
- Docs: `docs/self-hosting/demo.md`, README configuration table, `.env.example`, `docker-compose.yml`, CHANGELOG.
