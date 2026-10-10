# Design

## Context

Every mutation, whatever its origin, passes through `sync.Apply`, which knows for each op whether it won under LWW. That is the one place where "something changed" is known with certainty, so events must be derived there rather than from REST handlers or the client. The server runs as one process with one SQLite connection and must keep working on a Raspberry Pi; outbound HTTP from a self-hosted box on a home network is exactly the SSRF scenario, and typical receivers (Home Assistant, n8n) often live on that same network, so the policy must be explicit and owner-controlled.

## Goals / Non-Goals

**Goals:**
- Events for every write path with no duplicate or phantom events from LWW losers.
- Deliveries that survive restarts, retry sensibly, and are inspectable.
- Signatures receivers can verify in a few lines in any language.
- Safe by default against private-network targets, with an owner override.
- No new dependency; negligible idle cost.

**Non-Goals:**
- Guaranteed ordering or exactly-once; payload templating; inbound webhooks; events for shared projects or other users; server-level events (backups) in this change.

## Decisions

### D1. Event derivation inside `Apply`
`sync.Apply` already computes, per op, whether it was applied as a new winner. It gains an optional observer: after the transaction commits, it emits `[]Change{UserID, Entity, EntityID, Fields map[field]{from,to}, Origin}` grouped per entity for the batch. `internal/webhook` maps a change to one event by precedence: `created_at` newly set → `*.created`; `deleted_at` set → `*.deleted`; task `completed_at` null→value → `task.completed`, value→null → `task.reopened`; project `archived` false→true → `project.archived`; anything else → `*.updated`. One event per entity per batch. Losing ops are not in the change set, so they emit nothing. Origins (`server`, `import`, `caldav`, device ids) are included in the payload as `source` for receivers that want to ignore their own writes.
- Alternative: trigger events from REST handlers and the sync endpoint separately. Misses imports/CalDAV and duplicates logic; rejected.
- Alternative: poll the `ops` table from a worker. Adds latency and still needs LWW knowledge; rejected.

### D2. Persistent queue in SQLite, one worker
`webhook_deliveries(id, webhook_id, event, payload, status, attempts, next_attempt_at, last_status_code, last_error, response_excerpt, duration_ms, created_at, delivered_at)`. Enqueue happens in the same process right after `Apply` returns (separate short transaction). A single worker goroutine polls `status IN (pending, retry) AND next_attempt_at <= now` every second when idle (woken immediately by enqueue), delivers with a 10 s timeout, and updates the row. Backoff: 30 s, 5 min, 30 min, 2 h, 8 h, 16 h (6 attempts, about 27 h total) with ±20 % jitter. Consecutive failures counted on `webhooks.consecutive_failures`; at 20 the webhook is set `disabled_reason = 'too_many_failures'`. Pruning: deliveries older than 30 days and beyond the newest 100 per webhook, once an hour.
- Why one worker: a personal server with a handful of webhooks; concurrency of 4 per worker loop (bounded goroutines) is enough and keeps memory flat. Why SQLite rather than memory: restarts lose nothing; the delivery log is the queue's history, no second store.

### D3. Payload and signature format (`version: 1`)
Body:
```json
{"version":1,"id":"<delivery uuid>","event":"task.completed","time":1760060001000,
 "webhook_id":"…","source":"device|server|import|caldav",
 "data":{"task":{…current task…}}, "changes":{"completed_at":{"from":null,"to":1760060000000}}}
```
Headers: `Content-Type: application/json`, `User-Agent: OpenTodo/<version>`, `X-OpenTodo-Event`, `X-OpenTodo-Delivery`, `X-OpenTodo-Webhook`, `X-OpenTodo-Timestamp` (unix seconds), `X-OpenTodo-Signature: v1=<hex hmac-sha256(secret, "<timestamp>.<raw body>")>`. The `ping` event from the test action carries `data: {}`. Secrets are 32 random bytes shown once as `whsec_<base64url>`; they are stored in plaintext in the database because signing needs them (documented; the database is the trust boundary, and `backups` can encrypt archives). Redelivery reuses the body but gets a new id and timestamp so the signature differs.
- Why `timestamp.body`: the common scheme receivers already know how to verify; n8n and Home Assistant can check it with a few lines; `v1=` leaves room for rotation.

### D4. SSRF-safe client
A dedicated `http.Client` with `CheckRedirect` returning an error, a `DialContext` that resolves the host, filters every returned address against the deny list (loopback, link-local incl. `169.254.169.254` and `fd00::/8`, RFC 1918, CGNAT `100.64/10`, multicast, unspecified, IPv4-mapped equivalents), and dials the first allowed address directly so a DNS re-resolution cannot swap in a private address. The same check runs at webhook creation for early feedback. Owner policy `settings.webhooks_allow_private` (seeded by `OPENTODO_WEBHOOKS_ALLOW_PRIVATE`) disables the deny list but keeps redirects off and the scheme restriction. Response bodies are read up to 1 KB for the log and then discarded.

### D5. Routes and ownership
All `/api/v1/webhooks*` routes are `requireAuth` and scoped to the caller's `user_id` (foreign ids → 404). `PUT /api/v1/settings/webhooks` is owner-only (403 for members). Limits: 20 webhooks per user, URL length 2 KB, one project filter per webhook (list of ids can come later additively).

### D6. Data model impact
Additive tables `webhooks(id, user_id, url, secret, events, project_id, enabled, disabled_reason, consecutive_failures, created_at, updated_at)` and `webhook_deliveries` as above; `settings` created if absent (shared with `backups`/`caldav`). No op fields change; the op log is unaffected; export does not include webhooks (operational configuration, like tokens).

### D7. Dependencies and footprint
No new Go module: `crypto/hmac`, `crypto/sha256`, `net`, `net/http`, `math/rand/v2`. Binary growth under 150 KB; idle memory: one goroutine and a 1 s ticker; per delivery a few KB. Client: one settings section, under 6 KB gzipped.

## Risks / Trade-offs

- [A chatty device (bulk import, re-seed after restore) generates thousands of events] → events are coalesced per entity per batch; the queue is bounded by SQLite, not memory; the worker processes 4 at a time; import batches of 1,000 ops become at most 1,000 events only for subscribed webhooks. Documented; a per-webhook "ignore source import" option can be added later.
- [Receiver on LAN by default refused] → clear error naming the owner toggle; docs recipe for Home Assistant explains the one-time setting.
- [Plaintext secrets in the database] → equal to API-token threat model on the same host; backups can be encrypted; secrets are shown once and rotatable by deleting and recreating the webhook.
- [Slow receiver blocks the worker] → 10 s timeout, bounded concurrency, per-webhook consecutive-failure disable.
- [Event storm from LWW ties on re-seed after restore] → re-seeded ops that do not change the winning value are not winners and produce no change; only genuine differences emit events.
- [Payload includes task content sent over plain HTTP to a LAN] → allowed only to targets the user configured; the UI warns on `http://` targets outside loopback.

## Migration Plan

Additive migration; no behaviour until a webhook exists. Rollback: an older image ignores the new tables; pending deliveries are simply not sent.

## Open Questions

- Whether to add server-level events (`backup.failed`, `user.created`) under an owner-only webhook type; the queue and signer are reusable, only the event source differs.
- Whether a per-webhook filter on `source` is worth adding before `project-sharing` makes event volume higher.
