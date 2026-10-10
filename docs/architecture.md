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
| `store` | Opens SQLite (WAL, single connection) and applies embedded migrations by `PRAGMA user_version` |
| `auth` | Users, argon2id passwords, sessions, API tokens |
| `sync` | Op schema and validation, `Apply` (idempotent, LWW), `Pull` (cursor), `List`/`Get` (materialized entities) |
| `httpapi` | Router, middleware (auth, origin check, security headers, logging), handlers for auth, sync, collections, export, health |
| `web` | Embeds the Vite build and serves it with SPA fallback and cache headers |
| `ids` | UUID v4 and random secrets without external dependencies |

Tables: `users`, `sessions`, `api_tokens`, `ops` (append-only log per user, `seq` autoincrement), `fields` (current winner per field).

### Request flow for a REST write

`POST /api/v1/tasks` → auth middleware resolves the user → body fields become ops with `ts = now`, `device = "server"` → `sync.Apply` → entity re-read from `fields` → JSON response. The ops land in the log, so devices receive them on their next sync.

## Client (`web/`)

| Module | Responsibility |
| --- | --- |
| `lib/db.ts` | Dexie database: `projects`, `tasks`, `outbox`, `meta` |
| `lib/types.ts` | Entity types; field names mirror `internal/sync/ops.go` |
| `lib/hlc.ts` | Hybrid logical clock and the shared `wins()` rule |
| `lib/ops.ts` | `applyOps` (per-field LWW into IndexedDB), `mutate` (local apply + outbox + notify), entity helpers |
| `lib/sync.ts` | Background push/pull loop, triggers, status store (`useSyncStatus`) |
| `lib/api.ts` | Fetch wrappers and `ApiError` |
| `app/` | Router, auth screens, shell, views, detail panel, settings |

The UI never talks to the server for task data. Views subscribe to IndexedDB with `useLiveQuery`; both local edits and remote ops surface through the same path.

## Build and packaging

`web/` builds into `internal/web/dist`, which `go:embed` compiles into the binary. The Dockerfile runs both builds and copies the binary into `gcr.io/distroless/static:nonroot`. CI publishes `linux/amd64` and `linux/arm64` images to GHCR.

## Specs

Behavior is specified in `openspec/specs/<capability>/spec.md` (live) and proposed in `openspec/changes/`. See `CONTRIBUTING.md`.
