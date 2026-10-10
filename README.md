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
  <a href="docs/self-hosting/coolify.md">Deploy on Coolify</a> ·
  <a href="docs/self-hosting/docker.md">Docker</a> ·
  <a href="docs/api.md">API</a> ·
  <a href="docs/cli.md">CLI</a> ·
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

## Why OpenTodo

- **No subscription, no lock-in.** Free software under the AGPL. Nobody can paywall your task list or shut it down with the company.
- **Local-first.** The app keeps a full copy of your data on every device and works entirely offline. The server only syncs, backs up and, later, shares.
- **Your data, one folder.** Everything lives in a single `/data` volume: one SQLite file. Back that up and you have backed up everything. Export to JSON any time from Settings.
- **Tiny footprint.** One container, one static binary, around 12 MB. Runs on a Raspberry Pi or the cheapest VPS. No database server, no Redis, no build step at runtime.
- **Private by design.** No telemetry, no analytics, no phone-home, no third-party scripts. Sign-up is closed by default after the owner account is created; add people with single-use invitation links from **Settings → Members**.
- **Keyboard-first.** `q` to capture, `j`/`k` to move, `c` to complete, `1`–`4` for priority, `g` `t` for Today. Press `?` in the app for the full list.
- **Built in the open with specs.** Every feature starts as an [OpenSpec](https://github.com/Fission-AI/OpenSpec) change under [`openspec/`](openspec/), so behavior is documented before it is built.

OpenTodo belongs to the growing family of open-source, self-hostable replacements for subscription apps: a polished, modern app that gives you the comfort of a commercial product with software you run yourself.

## Features

**Today** (v0.1, the walking skeleton)

| Area | What works |
| --- | --- |
| Capture | Quick-add from any view, keyboard shortcut `q`; new tasks in Today get today's date, in a project get that project |
| Organise | Projects with colours, Inbox, Today, Upcoming (grouped by day), Completed |
| Tasks | Title, notes, project, priority P1–P4, floating due date with optional time, complete / reopen, delete |
| Subtasks | Nest tasks to any depth; parents show `done/total` progress; completing or deleting a parent cascades; `a` adds a subtask, Tab / Shift+Tab indent and outdent, Left / Right collapse and expand; concurrent moves on two devices never leave a task nested inside itself |
| Offline | Every change is applied locally first and queued; the app loads and works with no network. Installable PWA |
| Sync | Field-level, conflict-free sync across all your devices; concurrent edits converge without "pick a version" dialogs |
| Accounts | First-run owner setup, email + password sign-in, sessions, optional open sign-up |
| API | Authenticated REST API and API tokens for scripts and integrations; full JSON export |
| CLI | `ot`: a stdlib-only command-line client (`ot add "Call the plumber" --due tomorrow`, `ot today`, `--json` for scripts), see [docs/cli.md](docs/cli.md) |
| Hosting | Single distroless container, health check, Coolify-ready compose file, zero mandatory configuration |

**Next** (see [ROADMAP.md](ROADMAP.md) for the full plan): natural-language quick add ("Call Sarah next Wed 3pm #work p1"), labels and filter queries, recurring tasks, reminders, sharing and comments, CalDAV, webhooks, import from other task apps, passkeys and OIDC, optional end-to-end encryption.

## Quick start

### Coolify (recommended)

1. In Coolify: **New Resource → Docker Compose → Public Repository**, URL `https://github.com/pixari/opentodo`.
2. Coolify picks up `docker-compose.yml`, assigns a domain to the `opentodo` service and provisions HTTPS.
3. Deploy, open the domain, create the owner account.

No environment variables are required. Details, including building from source and persistent storage, are in [docs/self-hosting/coolify.md](docs/self-hosting/coolify.md).

### Docker Compose

```bash
git clone https://github.com/pixari/opentodo.git
cd opentodo
cp .env.example .env          # optional, every value has a default
docker compose up -d
```

Open <http://localhost:8080> and create the owner account. Data is kept in the `opentodo-data` volume.

### Single binary

```bash
make build                    # needs Go 1.26+ and Node 22+
./bin/opentodo                # serves on :8080, data in ./data
```

### Command line

`ot` talks to any OpenTodo server over the REST API with a token it creates for you at login. It is a separate static binary (release assets for Linux, macOS and Windows, or `go install github.com/pixari/opentodo/cmd/ot@latest`) and is not part of the container image.

```bash
ot login https://todo.example.com
ot add "Call the plumber" --project Home --due tomorrow --time 09:00 --priority 2
ot today
ot done 8c2a                  # full id or unique prefix
ot list --json | jq '.[].title'
```

Stable `--json` output and exit codes make it usable from cron and scripts. Full reference: [docs/cli.md](docs/cli.md).

## Configuration

All settings are environment variables with safe defaults. See [`.env.example`](.env.example).

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENTODO_ADDR` | `:8080` | Listen address |
| `OPENTODO_DATA_DIR` | `/data` (image) / `./data` (binary) | Where the SQLite database lives |
| `OPENTODO_BASE_URL` | inferred | Public URL; enables the `Secure` cookie flag and strict origin checks behind a proxy |
| `OPENTODO_ALLOW_SIGNUP` | `false` | Let anyone create an account after the owner exists. Prefer [invitations](#adding-people) |
| `OPENTODO_SESSION_DAYS` | `90` | Browser session lifetime |
| `OPENTODO_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## Adding people

Sign-up stays closed after the owner account exists. To add a partner or a colleague, open **Settings → Members**, optionally enter their email, pick an expiry (1 hour to 30 days, default 7 days) and create an invitation. Copy the link (it is shown once) and send it however you like; OpenTodo sends no email. The link creates exactly one `member` account and then stops working; you can revoke a pending link at any time. Setting `OPENTODO_ALLOW_SIGNUP=true` instead opens registration to anyone who can reach the server. Set `OPENTODO_BASE_URL` so links point at your public URL. API details: [docs/api.md](docs/api.md#invitations).

## How it works

```
┌───────────────────────── device ─────────────────────────┐      ┌──────────── server ────────────┐
│ React PWA  ──►  IndexedDB (source of truth)              │      │ Go binary + SQLite             │
│                 │ every edit = field ops {ts, device}    │ sync │  ops log (append-only)         │
│                 └► outbox ──────────────────────────────►├─────►│  fields (last-writer-wins)     │
│                 ◄─ ops from other devices ◄──────────────┤◄─────┤  REST API writes through ops   │
└──────────────────────────────────────────────────────────┘      └────────────────────────────────┘
```

- Every change is a small operation that sets one field of one entity, stamped with a hybrid logical clock and the device id.
- Clients apply ops locally first, then push the outbox and pull what other devices wrote. The same per-field last-writer-wins rule runs on every replica, so all devices converge on the same state no matter the order ops arrive in.
- The REST API writes through the same log, so a script that creates a task via `curl` shows up on your phone on the next sync.
- Deletes are tombstones, which keeps sync correct and makes an undo / trash feature possible later.

More in [docs/architecture.md](docs/architecture.md) and [docs/sync.md](docs/sync.md).

## Development

```bash
make dev        # Go API on :8080 + Vite with hot reload on :5173
make check      # vet, typecheck, Go + web tests, OpenSpec validation (what CI runs)
```

Repository layout:

```
cmd/opentodo/        server entry point (serve, healthcheck, version)
cmd/ot/              command-line client entry point (logic in internal/cli)
internal/            Go packages: config, store (SQLite + migrations), auth, sync (op log), httpapi, web (embed), cli
web/                 React 19 + Vite + Tailwind PWA; builds into internal/web/dist
openspec/            specs (live behavior contracts) and changes (proposals in flight / archived)
docs/                architecture, sync protocol, API, self-hosting guides
```

### Working with specs

This repository uses [OpenSpec](https://github.com/Fission-AI/OpenSpec). The current behavior of the product is described in `openspec/specs/<capability>/spec.md`; each new feature is a change folder with a proposal, delta specs, a design and a task list. With Claude Code or any supported assistant:

```
/opsx:propose "natural language quick add"   # plan a change
/opsx:apply                                  # implement it
/opsx:archive                                # merge its specs into the live ones
```

Validate everything with `npx @fission-ai/openspec validate --all --strict` (also part of `make check` and CI).

## Privacy

OpenTodo makes no network requests except to your own server. There are no analytics, crash reporters, update pings or third-party fonts. The only data that leaves your device is your own task data, sent to the server you chose.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md): changes that alter behavior go through an OpenSpec change first. Security issues go to the address in [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0-only](LICENSE). You can run, study, modify and share OpenTodo freely. If you offer a modified version as a network service, you must offer its source under the same license. That is what keeps a self-hosted project from being quietly turned back into a subscription.
