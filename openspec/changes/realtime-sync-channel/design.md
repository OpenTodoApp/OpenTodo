# Design

## Context

Sync is a client-initiated exchange (`POST /api/v1/sync`) driven by triggers in `web/src/lib/sync.ts`: 250 ms after a local edit, on `online`, on tab visibility, every 30 s, and manually. Remote changes therefore arrive with up to 30 s latency. The server already has the one place where every write lands, `sync.Service.Apply`, used by both the sync endpoint and the REST write-through. The deployment target is one static binary in one container, often on a Raspberry Pi behind Coolify (Traefik), Caddy or nginx. Constraints: keep the op log the single write path, no new mandatory configuration, no new runtime dependency unless justified, authentication on every route.

## Goals / Non-Goals

**Goals:**
- Remote changes visible on other connected devices within about a second, without any change to the exchange protocol or the convergence rules.
- Fewer requests from idle tabs than today, not more.
- Degrade to today's behavior silently when the stream cannot be established.
- Zero configuration behind the proxies the self-hosting docs already cover.

**Non-Goals:**
- Transporting operations over the stream. Pull stays the only way data reaches a device, so the stream can be lossy.
- Bidirectional transport. The client has nothing to send that the existing endpoint does not already carry.
- Fan-out across processes or nodes. One process is the deployment contract; the notifier is in-memory.
- Waking devices whose app is closed (that is web push, `reminders`).

## Decisions

### D1. Server-sent events, not WebSockets
Chosen: `GET /api/v1/sync/events` served with `Content-Type: text/event-stream`, implemented with `net/http` and `http.Flusher`. Each event is `event: ops` with a data line `{"cursor": <latest seq>}`; a comment line `: ping` is written every 25 s as heartbeat.
- Why: SSE is one-directional, which is all we need; it rides on plain HTTP/1.1 and HTTP/2, needs no upgrade handling, works through every proxy that can stream a response, is natively supported by browsers with automatic reconnection semantics, and costs no dependency. WebSockets would need either a library or a hand-written framing layer and give nothing extra here.
- Alternatives: long polling (simple, but each wake-up costs a full request cycle and interacts badly with the existing single-flight sync loop); WebSocket (rejected above); faster polling (rejected: a Raspberry Pi serving ten tabs polling every 2 s is exactly what we want to avoid).

### D2. Wake-up carries only the latest cursor
The event payload is the user's latest `seq`. The client compares it with its stored cursor and skips the exchange if nothing is new. No op content is ever written to the stream.
- Why: keeps the stream safe to log, proxy and cache-bust; keeps "pull after cursor" the one delivery path, so a dropped event is harmless; makes future per-project fan-out for sharing a pure routing change.

### D3. In-process notifier keyed by user, excluding the originating device
`internal/sync` gains a small `Notifier` (map `userID → set of subscriber{device, chan}`, mutex-guarded, non-blocking sends with a one-slot channel so a slow client coalesces wake-ups instead of blocking `Apply`). `Apply` callers (sync handler and REST write-through) call `notifier.Notify(userID, originDevice, latestSeq)` after the transaction commits. REST writes use `device="server"`, so every browser device is woken. The subscriber whose `device` query parameter equals the origin is skipped so a device never re-syncs because of its own push.
- Why: the sync endpoint already knows the device; excluding it halves the request volume of a single-device user. Coalescing keeps memory bounded per connection regardless of write rate.
- Alternative: notify inside the SQLite transaction via a trigger table polled by the server. Rejected: more moving parts for no gain in a single process.

### D4. Client lifecycle in `sync.ts`
After `startSync()` the client opens an `EventSource` to `/api/v1/sync/events?device=<id>` (same-origin, cookie authenticated). On `ops` events it calls `requestSync(0)` if the event cursor is greater than the stored cursor. On `error` it closes the source and schedules a reconnect with backoff `min(30 s, 1 s · 2^n) ± 20 %`; a successful `open` resets `n`, sets `live: true` in the status snapshot and calls `requestSync(0)` to cover the gap. `stopSync()` closes the source. While `navigator.onLine === false` no connection is attempted; the `online` handler starts one. While `live` is true the periodic timer runs every 5 minutes instead of 30 s; it returns to 30 s on disconnect.
- Why `EventSource` rather than streaming `fetch`: automatic Last-Event-ID semantics are not needed, but `EventSource` is tiny, handles connection state and cookies, and is excluded from the service worker route list already (`/api/` is never cached). Bearer-token clients (scripts, future CLI) use streaming `fetch`, which the route supports because authentication is the ordinary middleware.

### D5. Proxy survival and limits
Response headers: `Cache-Control: no-cache`, `X-Accel-Buffering: no` (honored by nginx), `Connection: keep-alive` on HTTP/1.1; the handler flushes after every write and disables the server's write deadline for this route only. Heartbeat every 25 s stays below the common 30–60 s idle timeouts of Traefik, Caddy and nginx defaults. Per-user cap of 16 streams: exceeding it closes the oldest subscriber (a half-closed mobile connection is the typical victim) instead of refusing the new one. Streams are closed on graceful shutdown so proxies see a clean end and clients reconnect to the new process. Session validity is re-checked on each heartbeat so revoked sessions are cut within 25 s.
- Why oldest-wins eviction: refusing would lock out a phone whose previous connection the server has not yet noticed as dead.

### D6. Data model impact
None. No new table, column, op field or IndexedDB store. The status snapshot gains a `live: boolean`. Op schema untouched; nothing to rename.

### D7. Footprint
No new Go or npm dependency. Container image size unchanged. Runtime memory: one goroutine (~8 KB stack) plus a one-slot channel and the HTTP response buffer per open stream, on the order of 20–30 KB each; 50 connected tabs cost about 1.5 MB. CPU is negligible: one write per heartbeat, one per wake-up. Bundle impact under 1 KB gzipped.

## Risks / Trade-offs

- [A proxy buffers the whole response and nothing is delivered] → heartbeat plus no-buffering headers covers Traefik, Caddy and nginx defaults; the client treats "no `open` within 10 s" as failure and the polling fallback guarantees correctness regardless; the self-hosting docs gain a troubleshooting note.
- [Browsers cap HTTP/1.1 connections per origin at six; many tabs could starve API calls] → the app is served over the same origin as the API, HTTP/2 multiplexes behind every supported proxy; documented limitation for plain HTTP/1.1 setups; a `BroadcastChannel`-based single shared stream per browser profile is a possible follow-up without protocol change.
- [Thundering herd after a server restart] → jittered backoff, and reconnect syncs are ordinary exchanges the server already handles.
- [Mobile browsers freeze background tabs and drop the stream silently] → the existing visibility trigger syncs on return and the `error` handler reconnects; the five-minute poll is the last line of defence.
- [Slow client blocks `Apply`] → non-blocking coalescing send; `Apply` never waits on a subscriber.
- [Revoked session keeps receiving wake-ups] → per-heartbeat re-validation; wake-ups contain no data anyway.

## Migration Plan

Additive. Old clients ignore the new route and keep polling. Rollback is removing the route; clients fall back to polling automatically after the backoff cap. No data migration.

## Open Questions

- Whether the five-minute connected-mode poll can be dropped entirely once reconnect-sync has proven reliable in the field.
- Per-project fan-out shape once `project-sharing` lands (likely: subscribe by user, server resolves project membership at notify time).
