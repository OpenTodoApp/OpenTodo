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
| `auth` | Users, argon2id passwords, sessions, API tokens; provider identities (`identities`): subject-first matching, verified-email linking, provisioning under the sign-up policy, the SSO-only rule for local sign-in |
| `oidc` | Single sign-on with one OpenID Connect provider (OpenSpec `oidc-login`), standard library only: discovery with issuer check, PKCE, code exchange, JWKS cache, identity-token verification (RS256, PS256, ES256, EdDSA), the signed flow-state cookie, and the owner configuration (`oidc.*` settings keys, secret in `<data>/secrets/oidc.json`, `OPENTODO_OIDC_*` overrides). Its only outbound requests go to the configured issuer. `oidctest` is an in-process provider for tests. See [self-hosting/sso.md](self-hosting/sso.md) |
| `sync` | Op schema and validation, `Apply` (idempotent, LWW), `Pull` (cursor), `List`/`Get` (materialized entities), `Notifier` (per-user live wake-ups); after each committed batch it reports the winning changes to an optional observer |
| `notify` | Post-commit events for people (OpenSpec `task-assignment`): the `Sink` interface the sync service calls after a batch commits (`Service.AddSink`), and the in-app sink that stores `notifications` rows for `GET /api/v1/notifications`. Mentions in comments (`comments-and-activity`) use the optional `MentionSink` interface, so existing sinks keep compiling. Further sinks (web push, webhooks) register next to it; a service without sinks emits nothing |
| `activity` | Pure derivation of attributed activity events from ops (OpenSpec `comments-and-activity`, design D4): fold by actor and entity within 5 s, classify by touched fields, page newest first. `sync.Service.ActivityOps` reads the ops of one task or project from the scopes the caller can see; `web/src/lib/activity.ts` implements the same rule, pinned by `internal/activity/testdata/activity_fixture.json` |
| `webhook` | Outbound webhooks: maps observed changes to events, durable queue in SQLite, one worker with retries, HMAC signing, SSRF-safe HTTP client. See [webhooks.md](webhooks.md) |
| `push` | Reminders over web push (OpenSpec `reminders`): VAPID key pair in `<data>/push_vapid.pem`, ES256 JWTs and RFC 8291 `aes128gcm` encryption with the standard library, per-device `push_subscriptions`, and the scheduler goroutine (every 30 s) that pushes due reminders and records `delivered_at` as a `server` op. See [reminders.md](reminders.md) |
| `mcp` | Read-only Model Context Protocol server (OpenSpec `mcp-server`): a hand-written JSON-RPC 2.0 subset (initialize with version negotiation, ping, tools, resources; batches, notifications) whose tools and `opentodo://` resources only call `sync.List`/`Get`/`TaskComments`/`Memberships`, so sharing scopes and tombstones apply exactly as in REST; the owner toggle (`mcp.enabled` setting, cached in memory, `OPENTODO_MCP` first-start preset). `httpapi/mcp.go` owns the transport (404 while off, bearer-only auth, Origin, 1 MB cap). See [mcp.md](mcp.md) |
| `httpapi` | Router, middleware (auth, origin check, security headers, logging), handlers for auth, sync, collections, export, backups (owner only), health |
| `web` | Embeds the Vite build and serves it with SPA fallback and cache headers |
| `ids` | UUID v4 and random secrets without external dependencies |

Tables: `users`, `sessions`, `api_tokens`, `ops` (append-only log, `user_id` = author, `seq` autoincrement), `op_scopes` (the sharing scope of each op: `user:<id>` or `project:<id>`), `scope_fields` (current winner per field within a scope), `project_scopes` and `project_members` (shared projects and their roles, authorization data outside the op log), `member_backfills` (history replay progress per member device), `invitations`, `settings` (owner key/value policy), `webhooks` and `webhook_deliveries` (queue and delivery log), `backup_runs`, `push_subscriptions` (one per user and device, removed with the session that created it), `api_token_scopes` (`read` or `full` per token; no row means `full`), `identities` (provider issuer and subject linked to an account) and `session_oidc` (the identity-token hint of sessions that started through the provider, removed with the session); `settings` also holds the log `generation`.

### Reminder scheduler

`push.Service.Run` (started by `cmd/opentodo` unless `OPENTODO_PUSH=off`) runs one pass at startup and then every 30 s: a single query over `scope_fields` (personal scopes: reminders are always personal, even on a task in a shared project) selects reminders whose `fire_at` has passed, that are not deleted, not delivered or dismissed for the current firing (a `delivered_at`/`dismissed_at` older than `fire_at` belongs to an earlier one) and whose task is open. Each is encrypted and posted to every subscription of the owner (404/410 removes the subscription, other failures are counted), then `delivered_at` is written through `sync.Apply` as device `server`, which also wakes the user's devices. Delivery state lives in the op log, so a restart neither loses nor repeats a push (a crash between send and write can repeat one).
Tables: `users`, `sessions`, `api_tokens`, `ops` (append-only log, `user_id` = author, `seq` autoincrement), `op_scopes` (the sharing scope of each op: `user:<id>` or `project:<id>`), `scope_fields` (current winner per field within a scope), `project_scopes` and `project_members` (shared projects and their roles, authorization data outside the op log), `member_backfills` (history replay progress per member device), `invitations`, `settings` (owner key/value policy), `webhooks` and `webhook_deliveries` (queue and delivery log), `backup_runs`, `notifications` (in-app notifications, account data outside the op log); `settings` also holds the log `generation`.

### Request flow for a REST write

`POST /api/v1/tasks` → auth middleware resolves the user → body fields become ops with `ts = now`, `device = "server"` → `sync.ApplyStrict` resolves each op's scope and checks the caller's role (after commit, the observer queues webhook deliveries for genuine changes, for every member who can see the scope) → `sync.NotifyApplied` wakes the open event streams of everyone who can see the change → entity re-read from `scope_fields` → JSON response. The ops land in the log, so devices receive them on their next sync, which the wake-up triggers right away.

### Comments and activity

Comments are a synced entity (`comment`) stored like tasks in the task's scope; `sync.Apply` checks authorship per op (author equals submitter, only the author edits, the author, admins and the owner delete, viewers may comment), filters mentions to members and hands `notify.Mentioned` events to the sinks after commit. There is no activity table on the server: `GET /api/v1/{tasks|projects}/{id}/activity` reads the op log (`ActivityOps`, the same read path as revision history) and runs `activity.Derive` on every request; served ops carry `actor` (from `ops.user_id`) so devices can attribute changes. Each device records the task, project and comment ops it applies (author, old value) in a local `activity` table bounded to 500 events per project and derives the same events offline.

The activity feed (OpenSpec `activity-feed`) adds no server table: `GET /api/v1/activity` reads each shared project scope the caller belongs to (`sync.Service.FeedOps`), derives every project on its own and pages the merged list. What a user has seen is the personal entity `project_prefs` (`feed_seen_at`), which the scope resolver always places in the author's personal scope; unread counts and the feed itself are computed on the device from the local `activity` table (`lib/feed.ts`) and refresh through Dexie live queries whenever a sync writes ops.

### Live updates

`GET /api/v1/sync/events` is a server-sent event stream per device (`httpapi/events.go`). It carries only the latest op cursor, never data; the client reacts by running the ordinary sync exchange. `sync.Notifier` is the in-memory per-user fan-out; see `docs/sync.md`.

## Client (`web/`)

| Module | Responsibility |
| --- | --- |
| `lib/db.ts` | Dexie database: `projects`, `tasks`, `labels`, `views`, `reminders`, `comments`, `outbox`, `meta`, plus caches (`memberships`, `notifications`), the local `activity` log and `prefs` (synced `project_prefs`, activity-feed) |
| `lib/comments.ts`, `lib/activity.ts`, `lib/markdown.ts` | Comment writes, thread order and mention helpers; the shared activity rule, local recording with per-project retention and merging of older server pages (`lib/feed.ts`: the cross-project feed, unread counts and seen markers); the in-house markdown subset (parsed to data, rendered by `app/Markdown.tsx` as React elements, so raw HTML never reaches the DOM) |
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
