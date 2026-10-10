# Architecture

OpenTodo is a local-first application with a thin sync server.

```
┌──────────────────────── browser / PWA ────────────────────────┐
│  React views  ◄── useLiveQuery ──  IndexedDB (Dexie)          │
│       │                               ▲        │               │
│   mutate()  ──► applyOps (LWW) ───────┘        └► outbox       │
│                                                       │        │
│  sync engine: push outbox / pull since cursor ◄───────┘        │
└──────────────────────────────┬────────────────────────────────┘
                               │  POST /api/v1/sync  (JSON, same origin)
                               │  GET  /api/v1/sync/events  (SSE wake-ups, cursor only)
┌──────────────────────────────▼────────────────────────────────┐
│  Go server (single static binary)                              │
│  httpapi ── auth (sessions, tokens) ── sync (ops, fields)      │
│     │                                      │                   │
│  embedded web app (internal/web/dist)   SQLite (/data)         │
└───────────────────────────────────────────────────────────────┘
```

## Server (`cmd/opentodo`, `internal/`)

| Package | Responsibility |
| --- | --- |
| `config` | `OPENTODO_*` environment variables with defaults and validation |
| `store` | Opens SQLite (WAL, single connection) and applies embedded migrations by `PRAGMA user_version`; `Lock` holds `<data>/opentodo.lock` for the process lifetime |
| `settings` | Owner-level key/value settings (`settings` table, JSON values) and 0600 secret files under `<data>/secrets/` |
| `backup` | Snapshots (`VACUUM INTO`), tar/gzip archives, `OTBK1` encryption, local / S3 (SigV4) / WebDAV destinations, scheduler, retention, `Restore`; see [backups.md](backups.md) |
| `auth` | Users, argon2id passwords, sessions, API tokens |
| `sync` | Op schema and validation, `Apply` (idempotent, LWW), `Pull` (cursor), `List`/`Get` (materialized entities), `Notifier` (per-user live wake-ups); after each committed batch it reports the winning changes to an optional observer |
| `webhook` | Outbound webhooks: maps observed changes to events, durable queue in SQLite, one worker with retries, HMAC signing, SSRF-safe HTTP client. See [webhooks.md](webhooks.md) |
| `push` | Reminders over web push (OpenSpec `reminders`): VAPID key pair in `<data>/push_vapid.pem`, ES256 JWTs and RFC 8291 `aes128gcm` encryption with the standard library, per-device `push_subscriptions`, and the scheduler goroutine (every 30 s) that pushes due reminders and records `delivered_at` as a `server` op. See [reminders.md](reminders.md) |
| `httpapi` | Router, middleware (auth, origin check, security headers, logging), handlers for auth, sync, collections, export, backups (owner only), health |
| `web` | Embeds the Vite build and serves it with SPA fallback and cache headers |
| `ids` | UUID v4 and random secrets without external dependencies |

Tables: `users`, `sessions`, `api_tokens`, `ops` (append-only log per user, `seq` autoincrement), `fields` (current winner per field), `invitations`, `settings` (owner key/value policy), `webhooks` and `webhook_deliveries` (queue and delivery log), `backup_runs`, `push_subscriptions` (one per user and device, removed with the session that created it); `settings` also holds the log `generation` and each user's last reported zone offset (`tz_offset:<user>`).

### Reminder scheduler

`push.Service.Run` (started by `cmd/opentodo` unless `OPENTODO_PUSH=off`) runs one pass at startup and then every 30 s: a single query over `fields` selects reminders whose `fire_at` has passed, that are not deleted, not delivered or dismissed for the current firing (a `delivered_at`/`dismissed_at` older than `fire_at` belongs to an earlier one) and whose task is open. Each is encrypted and posted to every subscription of the owner (404/410 removes the subscription, other failures are counted), then `delivered_at` is written through `sync.Apply` as device `server`, which also wakes the user's devices. Delivery state lives in the op log, so a restart neither loses nor repeats a push (a crash between send and write can repeat one).

### Request flow for a REST write

`POST /api/v1/tasks` → auth middleware resolves the user → body fields become ops with `ts = now`, `device = "server"` → `sync.Apply` (after commit, the observer queues webhook deliveries for genuine changes) → `sync.Notifier.Notify` wakes the user's open event streams → entity re-read from `fields` → JSON response. The ops land in the log, so devices receive them on their next sync, which the wake-up triggers right away.

### Live updates

`GET /api/v1/sync/events` is a server-sent event stream per device (`httpapi/events.go`). It carries only the latest op cursor, never data; the client reacts by running the ordinary sync exchange. `sync.Notifier` is the in-memory per-user fan-out; see `docs/sync.md`.

## Client (`web/`)

| Module | Responsibility |
| --- | --- |
| `lib/db.ts` | Dexie database: `projects`, `tasks`, `labels`, `views`, `reminders`, `outbox`, `meta` |
| `lib/types.ts` | Entity types; field names mirror `internal/sync/ops.go` |
| `lib/hlc.ts` | Hybrid logical clock and the shared `wins()` rule |
| `lib/ops.ts` | `applyOps` (per-field LWW into IndexedDB), `mutate` (local apply + outbox + notify), entity helpers |
| `lib/sync.ts` | Background push/pull loop, triggers, live-update channel (`EventSource` with backoff), status store (`useSyncStatus`) |
| `lib/api.ts` | Fetch wrappers and `ApiError` |
| `lib/reminders.ts`, `lib/reminderTime.ts`, `lib/reminderWatcher.ts`, `lib/push.ts` | Reminder writes and time arithmetic (relative reminders follow `due` inside `mutateMany`), the in-app watcher that drives the toasts, and the device's push subscription |
| `public/push-sw.js` | Imported by the generated service worker: `push` (defers to a focused window, otherwise a notification titled from IndexedDB), `notificationclick` (snooze / dismiss written as ops into IndexedDB and the outbox, uploaded by an open window or a direct `/api/v1/sync`), `notificationclose` |
| `app/` | Router, auth screens, shell, views, detail panel, settings |

The UI never talks to the server for task data. Views subscribe to IndexedDB with `useLiveQuery`; both local edits and remote ops surface through the same path.

## Build and packaging

`web/` builds into `internal/web/dist`, which `go:embed` compiles into the binary. The Dockerfile runs both builds and copies the binary into `gcr.io/distroless/static:nonroot`. CI publishes `linux/amd64` and `linux/arm64` images to GHCR.

## Specs

Behavior is specified in `openspec/specs/<capability>/spec.md` (live) and proposed in `openspec/changes/`. See `CONTRIBUTING.md`.
