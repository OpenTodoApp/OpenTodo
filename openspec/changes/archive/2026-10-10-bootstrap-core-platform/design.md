# Design

## Context

Greenfield repository. See proposal.md for motivation. Constraints that shape the approach: must run on a Raspberry Pi in one container, must work fully offline, must converge across devices without manual conflict resolution, must be deployable on Coolify with no mandatory configuration, and must leave room for the roadmap (NLP capture, subtasks, sharing, CalDAV, E2EE) without rewriting the data layer.

## Goals / Non-Goals

**Goals:**
- Prove the full loop end to end: install → owner setup → capture → sync between two devices → export.
- Make the sync model the single write path from day one (UI, REST, future CLI and integrations).
- Keep the operational surface tiny: one binary, one SQLite file, env vars only.
- Ship tests for the convergence properties on both server and client.

**Non-Goals:**
- Real-time push between devices (polling + event triggers is enough now; `realtime-sync-channel` later).
- Collaborative text editing (notes are plain strings with field-level LWW; `collaborative-rich-text` later).
- Multi-tenant sharing. The op log is per user; sharing will introduce a per-project log owner later.

## Decisions

### D1. Go + pure-Go SQLite, static binary, distroless image
Chosen: Go 1.26 with `modernc.org/sqlite` (no CGO), `net/http` stdlib router, frontend embedded with `embed`. Image is `gcr.io/distroless/static:nonroot`.
- Why: one ~12 MB binary, no runtime dependencies, trivial cross-compilation for arm64 (Raspberry Pi), SQLite is the right database for a single-node personal server and makes "back up one folder" true.
- Alternatives: Node (larger image, more memory on a Pi), Rust (slower iteration for contributors; nothing here needs it), Postgres (second container, breaks the one-volume promise).
- Footprint: binary 11.8 MB stripped, RSS ~25 MB idle. SQLite is opened with one connection, WAL mode, `busy_timeout` 5 s, `synchronous=NORMAL`.

### D2. Field-level last-writer-wins operation log as the sync primitive
Chosen: every mutation is a set of ops `{id, entity, entityId, field, value, ts, device}`. The server stores all ops append-only (`ops` table, per user, monotonically increasing `seq`) and materializes current values in `fields` keyed by (user, entity, id, field) with `(ts, device)` as the winner clock. Clients keep the same per-field clock next to each row. Deletes are a `deleted_at` tombstone field.
- Why: this is an LWW-register map, a state-based CRDT: commutative, associative, idempotent, so devices converge regardless of order and retries are safe. It needs no CRDT library, is debuggable in SQL, keeps the op format tiny and makes the REST API trivially consistent (REST writes are just ops with `device="server"`). The op log doubles as history for a future "revision history / trash" feature.
- Alternatives considered:
  - Yjs / Automerge whole-document CRDT: excellent for text, but a document per user does not shard, adds 50–150 KB to the bundle, makes server-side REST writes and queries awkward, and encrypts poorly later. Deferred to notes/comments only (`collaborative-rich-text`).
  - Server-authoritative REST with optimistic UI: simplest, but offline editing then needs ad-hoc conflict handling; rejected as it violates the local-first principle.
  - Row-level LWW: loses concurrent edits to different fields of the same task (the common "phone changes date, laptop changes title" case). Field level is the right granularity for a task.
- Known limit: `labels` (array) is replaced wholesale; a set CRDT can be introduced per field later without changing the transport.

### D3. Hybrid logical clock on the client, clamp on the server
Clients stamp ops with `max(now + offset, last + 1)`; the server returns `serverTime` and the client corrects `offset` only when skew exceeds two seconds. The server clamps timestamps more than five minutes ahead. Ties break on device id string comparison.
- Why: wall-clock LWW with a monotonic nudge is what users expect ("my latest edit wins"); clamping prevents a device with a wrong clock from pinning a field for ever.

### D4. Op schema as a validated allowlist
`internal/sync/ops.go` holds `Schema` (entity → field → kind). Unknown entities or fields and wrong JSON types are rejected per batch. Reserved fields for the roadmap (`parent_id` on both entities, `labels`) are already in the schema so older clients keep validating when newer ones start using them.
- Rule for the future: adding a field is additive; renaming or removing one needs a migration change.

### D5. Data model impact
New tables: `users`, `sessions`, `api_tokens`, `ops`, `fields`. Migrations are embedded SQL files applied by `PRAGMA user_version`. Entities are not stored as rows; REST reads assemble them from `fields` (fine for personal data volumes; a materialized `tasks` table can be added later as a pure read optimisation without changing the op log).

### D6. Authentication: email + password, cookie sessions, bearer tokens
argon2id (19 MiB, t=2, p=1), 256-bit session secrets stored as SHA-256, `HttpOnly; SameSite=Lax` cookie, `Secure` when `OPENTODO_BASE_URL` is https. CSRF defence: cookie-authenticated writes must have no `Origin` header or one equal to the configured/base origin (including `X-Forwarded-Host` for proxies). Bearer tokens (`ot_` prefix) for scripts, stored hashed, shown once. Fixed-window rate limit on login/register per IP.
- Why: smallest secure baseline that works on day one without external services. Passkeys and OIDC are planned as additive changes (`passkeys`, `oidc-login`); the session layer is independent of the credential type.
- Alternative: passkeys-only like openGym. Rejected for v0.1 because passkeys require https even for a first LAN test and complicate CLI use.

### D7. Client stack
React 19 + Vite 8 + Tailwind 4 + Dexie 4 (IndexedDB) + `vite-plugin-pwa`. A 40-line history router instead of react-router. Live views use `useLiveQuery` so every component re-renders from IndexedDB changes, which is also how remote ops surface in the UI with no extra plumbing. Bundle: ~110 KB gzipped JS, 6 KB CSS.
- Alternatives: Svelte (smaller output, but React has the larger contributor pool and the openGym precedent); SQLite-WASM in the browser (another 1 MB and OPFS complexity; IndexedDB is enough for the data volume of a personal task list).

### D8. Serving and security headers
The Go server serves `/api/v1/*` and `/healthz`, everything else falls back to the embedded `index.html` (hashed assets cached immutable, shell `no-cache`). CSP: `default-src 'self'`, `script-src 'self'` (the PWA registration script is an external file, no inline scripts), `style-src 'self' 'unsafe-inline'` (Tailwind output plus inline colour swatches), `frame-ancestors 'none'`.

### D9. Deployment contract for Coolify
`docker-compose.yml` uses Coolify's magic variables: `SERVICE_FQDN_OPENTODO_8080` (domain + internal port) and `${SERVICE_URL_OPENTODO}` as `OPENTODO_BASE_URL`, falling back to plain `.env` values outside Coolify. Named volume on `/data`. Health check uses the binary's own `healthcheck` subcommand because distroless has no curl. The published image is `ghcr.io/pixari/opentodo` (multi-arch amd64/arm64 built by CI); `build: .` is documented as the alternative.

## Risks / Trade-offs

- [LWW loses one of two concurrent edits to the same field] → Acceptable for task fields; the op log keeps the loser, so a future history view can expose it. Text-heavy fields move to a text CRDT later.
- [Device clocks skewed] → monotonic HLC + server offset correction + 5-minute clamp; ties deterministic.
- [Op log grows for ever] → tiny rows; a compaction job (drop ops superseded in `fields` once every device cursor passed them) can be added without protocol change.
- [Assembling entities from `fields` on every REST read] → O(fields per user); fine for thousands of tasks, revisit with a materialized table if needed.
- [Single SQLite connection serialises writes] → personal-scale server; measured sync round trip < 5 ms locally.
- [No real-time push] → 30 s poll plus triggers; `realtime-sync-channel` will add SSE.
- [Password-only auth at v0.1] → rate limiting, argon2id, closed sign-up by default; passkeys/MFA planned.

## Migration Plan

Greenfield: no migration. Rollback is "stop the container"; the data directory is forward-only but migrations are additive.

## Open Questions

- Compaction policy for the op log once multi-device cursors exist (not needed for correctness).
- Whether `labels` should become a set CRDT before or after the `labels` UI change.
