<p align="center">
  <img src="web/public/pwa-192.png" width="96" height="96" alt="OpenTodo logo">
</p>

<h1 align="center">OpenTodo</h1>

<p align="center"><strong>Your tasks, your server.</strong><br>
An open-source, local-first task manager you can host yourself. Everything you expect from a commercial task app, without the subscription or the lock-in.</p>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg"></a>
  <a href="https://github.com/pixari/opentodo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pixari/opentodo/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Docker image size" src="https://img.shields.io/badge/image-%3C%2025%20MB-success">
  <img alt="Spec-driven with OpenSpec" src="https://img.shields.io/badge/specs-OpenSpec-8A2BE2">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/self-hosting/coolify.md">Coolify</a> ·
  <a href="docs/self-hosting/docker.md">Docker</a> ·
  <a href="docs/README.md">Documentation</a> ·
  <a href="docs/api.md">API</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

<p align="center">
  <img src="docs/screenshots/today.png" width="800" alt="Today view with overdue and due-today tasks">
</p>

<p align="center">
  <img src="docs/screenshots/project.png" width="420" alt="Project view with the task detail panel">
  <img src="docs/screenshots/mobile-dark.png" width="180" alt="Mobile dark mode">
</p>

<p align="center">
  <img src="docs/screenshots/day.png" width="800" alt="Day view: timed tasks as blocks sized by their estimate, overlapping blocks side by side, the unscheduled lane and the planned total against the day length">
</p>

## Why OpenTodo

- **No subscription, no lock-in.** Free software under the AGPL. Nobody can paywall your task list or shut it down with the company.
- **Local-first.** Every device keeps a full copy of your data and works entirely offline. The server syncs, backs up and shares; it is never in the way of an edit.
- **Your data, one folder.** Everything lives in one `/data` volume around a single SQLite file. Export to JSON at any time, import it (or a CSV, or another app's export) on any instance, and schedule encrypted backups to disk, S3 or WebDAV.
- **Tiny footprint.** One container, one static binary of about 17 MB with the web app inside, around 20 MB of memory when idle. Runs on a Raspberry Pi or the cheapest VPS. No database server, no Redis, no mandatory configuration.
- **Private by design.** No telemetry, no analytics, no phone-home, no third-party scripts or fonts. The server only contacts what you configure (see [Privacy](#privacy)).
- **Keyboard-first.** `q` to capture, `j`/`k` to move, `c` to complete, `1`–`4` for priority, `g` `t` for Today, `?` for the full list, and optional Vim keybindings.
- **Built in the open with specs.** Every feature starts as an [OpenSpec](https://github.com/Fission-AI/OpenSpec) change under [`openspec/`](openspec/), so behaviour is documented before it is built.

## Features

### Capture

- **Quick add from anywhere** (`q`), with the view's context as defaults: today in Today, the current project in a project.
- **Natural language in six languages, offline**: `Call Sarah next Wed 3pm #work @call p1 +30m` sets the date, time, project, label, priority and estimate, with dismissible preview chips. English, German, French, Italian, Spanish and Portuguese. [Syntax](docs/quick-add.md)
- **Voice capture** (opt-in per device): dictate into quick add with the microphone button or `Shift+V`; "hashtag home priority two" becomes `#home p2`. Uses the browser's own speech recognition; the server never receives audio. [Voice](docs/quick-add.md#voice)
- **Share sheet, bookmarklet and browser extension**: send a page from the phone's share menu, any desktop browser or the Chromium/Firefox extension in [`extension/`](extension/) to a prefilled capture screen. Works offline, holds no token. [Capture](docs/capture.md)
- **Email to task**: forward a mail to your secret address (`todo+…@example.com`) and it lands in the Inbox. Optional; the operator points OpenTodo at one IMAP mailbox. [Email](docs/email.md)
- **Command line**: `ot add "Call the plumber" --due tomorrow`, `ot today`, `--json` for scripts. [CLI](docs/cli.md)

### Organisation and views

- **Inbox, Today, Upcoming, Completed** and projects with colours, nested to any depth, with rolled-up counts.
- **Subtasks** to any depth with `done/total` progress; Tab and Shift+Tab indent and outdent.
- **Sections and Kanban board** per project (`v` toggles list and board), drag and drop on mouse and touch, or `Shift+←/→`.
- **Manual ordering** by drag and drop or `Alt+↑/↓`, convergent across devices.
- **Labels** across projects with colours, a type-ahead picker (`L`), per-label views and merging of duplicates.
- **Filters**: one-line queries such as `@work & due <= tomorrow & p1`, evaluated on the device, live and offline. [Filters](docs/filters.md)
- **Saved views and dashboards**: pin a filter to the sidebar with live counts, choose grouping and sort, combine up to six views on one dashboard. [Saving views](docs/filters.md#saving-views)
- **Rich-text notes** with headings, lists, check lists, links and Markdown shortcuts; edits from several devices or people merge character by character, offline too. Scripts and integrations keep reading the note as Markdown.
- **Trash and history**: restore deleted tasks and projects, browse each item's change history with "restore this value", empty the Trash for good; old items are purged after 30 days. Projects whose tasks are all done are archived automatically. [Purge](docs/sync.md#purge)
- **Vim keybindings** (opt-in per device): modes, counts, `gg`/`G`, `dd` and a `:` command line.

### Time

- **Floating due dates with optional time**, the same day and time wherever you are; a timed task can be **fixed to a time zone** (`z`) for meetings and flights. See [Floating vs fixed times](#floating-vs-fixed-times).
- **Recurring tasks** with rules you can read: `every weekday`, `every last weekday`, `every 3 days after completion`, `until 2026-12-31`, `for 10 times`; skip or detach one occurrence. [Recurrence](docs/recurrence.md)
- **Reminders**: any number per task, relative to the due time or at a fixed moment, with snooze and dismiss. In the app offline, and as **web push** to devices that opt in, with no vendor account. [Reminders](docs/reminders.md)
- **Time blocking**: duration estimates (`e`), Day and Week calendars (`g d`, `g w`) with a 15-minute grid, drag to schedule or resize, planned hours against your day length, full keyboard control.

### Collaboration

- **Shared projects** with the accounts on your server as viewer, editor or admin (`Shift+S`); members edit offline and converge like your own devices; roles are enforced by the server. [Sharing](docs/api.md#sharing)
- **Assignees** (`Shift+A`), an **Assigned to me** view and in-app notifications. [Assignment](docs/api.md#assignment-and-notifications)
- **Threaded Markdown comments** with `@mentions`, and a per-task and per-project **activity log** derived from the sync history. [Comments](docs/api.md#comments-and-activity)
- **Activity feed** (`g h`) across every shared project, with unread counts that sync between your own devices only. [Activity feed](docs/api.md#activity-feed)
- **Invitations and user administration**: single-use invitation links, admin and member roles, deactivation, reset links you send yourself, owner transfer. [Adding people](#adding-people)

### Integrations and data

- **REST API and API tokens** (full or read-only) that write through the same op log as the app. [API](docs/api.md)
- **Calendar apps (CalDAV)**: two-way sync with Apple Reminders, Thunderbird and Android tasks apps via DAVx⁵, with per-device app passwords. Off until the owner enables it. [CalDAV](docs/caldav.md)
- **AI assistants (MCP)**: a read-only Model Context Protocol endpoint so an assistant can answer "what is on my plate today?". Off until the owner enables it. [MCP](docs/mcp.md)
- **Webhooks** on task and project events for Home Assistant, n8n or a Telegram relay: signed, retried, logged, with private-network protection. [Webhooks](docs/webhooks.md)
- **Import** the app's own export, CSV or other task managers' JSON exports, with a preview, duplicate detection and undo. [Import](docs/import.md)
- **Export** everything as JSON from Settings or `GET /api/v1/export`.
- **Scheduled backups** of the whole server to a folder, S3-compatible storage or WebDAV, with retention, optional encryption and `opentodo restore`. [Backups](docs/backups.md)

### Security and privacy

- **Closed sign-up by default** after the owner account is created; argon2id passwords, `HttpOnly` sessions, strict origin checks, CSP, rate limits.
- **Passkeys** (WebAuthn) with browser autofill; needs an https `OPENTODO_BASE_URL`.
- **Two-factor authentication** (TOTP) with recovery codes, "remember this device", an owner policy to require it, and step-up confirmation before sensitive changes.
- **Single sign-on** with your own OpenID Connect provider (Authentik, Keycloak, Authelia, Zitadel…), including an SSO-only mode with owner break-glass. [SSO](docs/self-hosting/sso.md)
- **Audit log** of sign-ins, credentials, invitations, exports and setting changes; never task content, client addresses only if the owner opts in. [What is logged](SECURITY.md#what-is-logged)
- **Optional end-to-end encryption** per account: titles, notes, names and comments are encrypted on your devices, so the server, backups and integrations hold only ciphertext. [Threat model](docs/e2ee.md)

### Everywhere

- **Offline and installable**: every change is applied locally first and queued; the app loads and works with no network.
- **Live sync**: field-level, conflict-free sync across devices with no "pick a version" dialogs; a change shows up on your other devices within a second or two, with polling as the fallback. [Sync protocol](docs/sync.md)

### Floating vs fixed times

A due date such as "pay rent on the 1st" or "call mum Sunday 18:00" is **floating**: it means that calendar day and clock time wherever you are, so it never moves when you travel. That is the default for every task.

Some times are instants: a stand-up at 09:00 Berlin time, a flight that departs at 14:35 in Lisbon. Open the task, set a time and tick **Fixed to time zone** (or press `z`): the time is pinned to your current zone. A device in Los Angeles then shows the stand-up at 00:00 with `09:00 Berlin` as a hint, and Today, Upcoming, sorting, filters, reminders and the calendar all use the converted time, across daylight-saving changes. The API takes the same shape: `"due":{"date":"2026-10-11","time":"09:00","tz":"Europe/Berlin"}`.

## Quick start

No environment variable is required. Open the app, create the owner account, and you are done; everything else is optional.

### Docker

```bash
docker run -d --name opentodo -p 8080:8080 -v opentodo-data:/data \
  ghcr.io/pixari/opentodo:latest
```

Open <http://localhost:8080> and create the owner account. Behind a reverse proxy, add `-e OPENTODO_BASE_URL=https://todo.example.com` (needed for `Secure` cookies, passkeys and web push). The image is published for `linux/amd64` and `linux/arm64`. Details: [docs/self-hosting/docker.md](docs/self-hosting/docker.md).

### Docker Compose

```bash
git clone https://github.com/pixari/opentodo.git
cd opentodo
cp .env.example .env          # optional, every value has a default
docker compose up -d
```

Data is kept in the `opentodo-data` volume.

### Coolify

1. **New Resource → Public Repository**, URL `https://github.com/pixari/opentodo`, build pack **Docker Compose**.
2. Assign a domain to the `opentodo` service; Coolify provisions HTTPS and passes the URL to the app.
3. Deploy, open the domain, create the owner account.

Details, including building from your fork: [docs/self-hosting/coolify.md](docs/self-hosting/coolify.md).

### Single binary

```bash
make build                    # needs Go 1.26+ and Node 22+
./bin/opentodo                # serves on :8080, data in ./data
```

The binary is fully static (`CGO_ENABLED=0`, pure-Go SQLite) and also offers `opentodo restore`, `opentodo mfa-reset`, `opentodo reset-owner-password`, `opentodo healthcheck` and `opentodo version`.

### Command line client

`ot` talks to any OpenTodo server over the REST API with a token it creates at login. It is a separate static binary (release assets for Linux, macOS and Windows, or `go install github.com/pixari/opentodo/cmd/ot@latest`) and is not part of the container image.

```bash
ot login https://todo.example.com
ot add "Call the plumber" --project Home --due tomorrow --time 09:00 --priority 2
ot today
ot done 8c2a                  # full id or unique prefix
ot list --json | jq '.[].title'
```

Full reference: [docs/cli.md](docs/cli.md).

## Configuration

Every setting is an optional environment variable with a safe default; an invalid value stops startup with a message naming the variable. The container image sets `OPENTODO_ADDR=:8080` and `OPENTODO_DATA_DIR=/data`. See [`.env.example`](.env.example) for a commented template.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENTODO_ADDR` | `:8080` | Listen address |
| `OPENTODO_DATA_DIR` | `./data` (binary), `/data` (image) | Directory for the SQLite database, secrets, the VAPID key and local backups |
| `OPENTODO_BASE_URL` | unset (inferred from requests) | Public URL. With https: `Secure` cookies, passkeys and web push; also used for strict origin checks and in invitation, reset and CalDAV links |
| `OPENTODO_ALLOW_SIGNUP` | `false` | Let anyone create an account after the owner exists. Prefer [invitations](#adding-people) |
| `OPENTODO_SESSION_DAYS` | `90` | Browser session lifetime in days |
| `OPENTODO_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |
| `OPENTODO_IMPORT_MAX_MB` | `20` | Largest [import](docs/import.md) file, 1–200 |
| `OPENTODO_TRASH_RETENTION_DAYS` | `30` | Days a deleted task or project stays in the Trash before it is purged, 0–3650; `0` never purges automatically. See [Purge](docs/sync.md#purge) |
| `OPENTODO_PUSH` | `on` | `off` disables web push for [reminders](docs/reminders.md): no requests to push services; reminders still show in the app |
| `OPENTODO_WEBHOOKS_ALLOW_PRIVATE` | unset | `true`/`false` presets the owner's "allow private network targets" [webhook](docs/webhooks.md#private-network-protection) policy on first start; afterwards Settings decides |
| `OPENTODO_MCP` | unset (off) | `true` presets the [AI assistants (MCP)](docs/mcp.md) endpoint on first start; afterwards Settings → AI assistants decides |
| `OPENTODO_CALDAV` | unset (off) | `true` presets the [CalDAV](docs/caldav.md) endpoint on first start; afterwards Settings → Calendar apps decides |
| `OPENTODO_OIDC_ISSUER`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_DISPLAY_NAME`, `_SSO_ONLY` | unset | Optional [single sign-on](docs/self-hosting/sso.md) settings; each one set overrides and locks that field in Settings → Single sign-on. The issuer must be https |
| `OPENTODO_EMAIL_ADDRESS`, `_IMAP_HOST`, `_IMAP_USER`, `_IMAP_PASSWORD` (or `_IMAP_PASSWORD_FILE`) | unset (off) | [Email to task](docs/email.md): all four together turn it on; setting only some stops startup |
| `OPENTODO_EMAIL_IMAP_MAILBOX`, `_POLL_SECONDS`, `_PROCESSED` | `INBOX`, `60`, `move:OpenTodo/Processed` | Email to task tuning (minimum poll 15 s; `_PROCESSED` may be `delete`) |
| `OPENTODO_BACKUP_*` | unset | Optional presets for [scheduled backups](docs/backups.md#environment-presets) (`DESTINATION`, `SCHEDULE`, `TIME`, `WEEKDAY`, `KEEP`, `MAX_AGE_DAYS`, `COMPRESS`, `LOCAL_DIR`, `S3_*`, `WEBDAV_*`, `PASSPHRASE`/`PASSPHRASE_FILE`), applied once; Settings → Backups wins afterwards |

`OPENTODO_PORT` in `.env` only changes the host port published by `docker-compose.yml`. The `ot` client reads its own variables (`OPENTODO_URL`, `OPENTODO_TOKEN`, `OPENTODO_PROFILE`, `OPENTODO_CONFIG`), see [docs/cli.md](docs/cli.md).

## Adding people

Sign-up stays closed after the owner account exists. To add a partner or a colleague, open **Settings → Members**, optionally enter their email, pick an expiry (1 hour to 30 days, default 7 days) and create an invitation. Copy the link (it is shown once) and send it however you like; OpenTodo sends no email. The link creates exactly one `member` account and then stops working; you can revoke a pending link at any time. Admins can create invitations too.

Manage accounts afterwards in **Settings → Users**: promote admins, deactivate and reactivate, issue password reset links, delete accounts, transfer ownership ([docs/self-hosting/docker.md](docs/self-hosting/docker.md#managing-users)). If the owner forgets their password, `opentodo reset-owner-password` on the host prints a reset link. With single sign-on configured, people can also sign in through your identity provider. Set `OPENTODO_BASE_URL` so links point at your public URL. API details: [docs/api.md](docs/api.md#invitations).

## How it works

```
┌───────────────────────── device ─────────────────────────┐      ┌──────────── server ────────────┐
│ React PWA  ──►  IndexedDB (source of truth)              │      │ Go binary + SQLite             │
│                 │ every edit = field ops {ts, device}    │ sync │  ops log (append-only)         │
│                 └► outbox ──────────────────────────────►├─────►│  fields (last-writer-wins)     │
│                 ◄─ ops from other devices ◄──────────────┤◄─────┤  REST, CalDAV, email, import   │
└──────────────────────────────────────────────────────────┘      │  all write through ops         │
                                                                  └────────────────────────────────┘
```

- Every change is a small operation that sets one field of one entity, stamped with a hybrid logical clock and the device id.
- Clients apply ops locally first, then push the outbox and pull what other devices wrote. The same per-field last-writer-wins rule runs on every replica, so all devices converge no matter the order ops arrive in. Rich-text notes are mergeable documents, so concurrent edits to one note combine instead of replacing each other.
- Each op belongs to a sharing scope (your personal data, or one shared project); the server checks the author's role when it receives an op.
- Connected devices keep a lightweight server-sent event stream open; when the server records new ops it tells the other devices "sync now" (no data on the wire). If the stream is unavailable the app polls.
- The REST API, CalDAV, email capture and imports write through the same log, so a task created with `curl` shows up on your phone right away.
- Deletes are tombstones, which keeps sync correct and powers the Trash.

More in [docs/architecture.md](docs/architecture.md) and [docs/sync.md](docs/sync.md).

## Documentation

All guides are indexed in [docs/README.md](docs/README.md):

- **Using OpenTodo**: [quick add](docs/quick-add.md) · [filters and saved views](docs/filters.md) · [recurring tasks](docs/recurrence.md) · [reminders](docs/reminders.md) · [capture](docs/capture.md) · [import](docs/import.md) · [end-to-end encryption](docs/e2ee.md)
- **Self-hosting**: [Docker](docs/self-hosting/docker.md) · [Coolify](docs/self-hosting/coolify.md) · [single sign-on](docs/self-hosting/sso.md) · [backups](docs/backups.md) · [email to task](docs/email.md) · [calendar apps (CalDAV)](docs/caldav.md)
- **Integrations**: [REST API](docs/api.md) · [CLI](docs/cli.md) · [webhooks](docs/webhooks.md) · [AI assistants (MCP)](docs/mcp.md)
- **Internals**: [architecture](docs/architecture.md) · [sync protocol](docs/sync.md)
- **Project**: [changelog](CHANGELOG.md) · [roadmap](ROADMAP.md) · [security](SECURITY.md) · [contributing](CONTRIBUTING.md)

## Development

```bash
make dev        # Go API on :8080 + Vite with hot reload on :5173
make check      # vet, typecheck, Go + web + extension tests, OpenSpec validation (what CI runs)
```

Repository layout:

```
cmd/opentodo/        server entry point (serve, restore, mfa-reset, reset-owner-password, healthcheck, version)
cmd/ot/              command-line client entry point (logic in internal/cli)
internal/            Go packages: store, sync, auth, httpapi, caldav, mcp, email, push, backup, … (see docs/architecture.md)
web/                 React 19 + Vite + Tailwind PWA; builds into internal/web/dist
extension/           browser capture extension (Manifest V3, plain JS)
openspec/            specs (live behaviour contracts) and changes (proposals in flight and archived)
docs/                user, operator and protocol documentation
```

### Working with specs

This repository uses [OpenSpec](https://github.com/Fission-AI/OpenSpec). The current behaviour of the product is described in `openspec/specs/<capability>/spec.md`; each new feature is a change folder with a proposal, delta specs, a design and a task list. With Claude Code or any supported assistant:

```
/opsx:propose "natural language quick add"   # plan a change
/opsx:apply                                  # implement it
/opsx:archive                                # merge its specs into the live ones
```

Validate everything with `npx @fission-ai/openspec validate --all --strict` (also part of `make check` and CI).

## Privacy

The web app makes no network requests except to your own server: no analytics, crash reporters, update pings or third-party fonts. The server makes outbound requests only for features you configure:

- web push to the push service a device's browser chose (Google, Mozilla, Apple), end-to-end encrypted and carrying only ids unless the device opts in to titles (`OPENTODO_PUSH=off` turns push off);
- webhook URLs you add;
- backup destinations (S3 or WebDAV) you configure;
- the single sign-on issuer you configure;
- the IMAP mailbox you configure for email to task.

The CalDAV and MCP endpoints only answer requests; they never call out. The audit log records security events (sign-ins, tokens, invitations, exports), never task content, and stores client addresses only if the owner turns that on; see [SECURITY.md](SECURITY.md#what-is-logged). With optional [end-to-end encryption](docs/e2ee.md) the server holds only ciphertext for task content.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md): changes that alter behaviour go through an OpenSpec change first. Security issues go to the address in [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0-only](LICENSE). You can run, study, modify and share OpenTodo freely. If you offer a modified version as a network service, you must offer its source under the same license. That is what keeps a self-hosted project from being quietly turned back into a subscription.
