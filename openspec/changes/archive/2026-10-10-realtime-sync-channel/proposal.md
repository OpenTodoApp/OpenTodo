# Proposal

## Why

Today a change made on one device reaches another only on the next poll, up to 30 seconds later, or when the user switches tabs. For a single person moving between phone and laptop that feels sluggish; for the shared lists, comments and collaborative notes on the roadmap it is a blocker, because every one of them needs the "other side" to notice an edit within a second or two. Polling faster would wake every open tab every few seconds, which is wasteful on a Raspberry Pi and on battery.

The op log already makes delivery cheap: the server knows exactly when new operations land for a user. What is missing is a way to tell the user's other devices "something arrived, come and sync", so the existing exchange runs immediately instead of on a timer.

## What Changes

- A live update channel: an authenticated, long-lived server-sent stream per device that the server pokes whenever operations for that user are recorded by another device or through the REST API. The poke carries no task data; the client reacts by running the normal sync exchange, so the protocol, the convergence rules and the single write path are unchanged.
- The client opens the channel after sign-in, reconnects with backoff when it drops, syncs immediately on every reconnect to cover anything missed, and falls back to the existing polling when the channel is unavailable. While the channel is connected the background poll is relaxed so idle tabs stop hammering the server.
- Heartbeats and no-buffering headers so the stream survives common reverse proxies (Coolify's Traefik, Caddy, nginx) and NAT idle timeouts; a per-user connection cap so a misbehaving client cannot exhaust the server.
- The sync status indicator shows whether live updates are connected; docs (`docs/sync.md`, self-hosting proxy notes) describe the channel.

Out of scope: WebSockets or any bidirectional transport (not needed, the client already pushes over the existing endpoint); pushing operation payloads over the channel; web push notifications when the app is closed (`reminders`); sharing between users (`project-sharing`, `activity-feed`), which will reuse this channel with a per-project fan-out; multi-process or multi-node fan-out (one container is the deployment target).

This change advances ROADMAP.md section 1, "Live push of changes between devices (no 30 s polling)" (`realtime-sync-channel`), and unblocks `activity-feed`, `comments-and-activity` and `collaborative-rich-text`.

No new mandatory environment variable. No change to the op log format. Not **BREAKING**: clients that never open the channel keep working with polling exactly as before.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- `offline-first-sync`: the "Sync triggers and status" requirement gains the live wake-up as a trigger and the connection state in the indicator; new requirements describe the live update channel itself: authentication, what a wake-up contains, exclusion of the originating device, connection lifecycle and reconnect, fallback to polling, per-user isolation, connection limits and reverse-proxy behavior.

## Impact

- Server: one new route `GET /api/v1/sync/events` (session or token authenticated), an in-process per-user notifier called after every successful `Apply` (sync endpoint and REST write-through), graceful close of open streams on shutdown. Standard library only; no new dependency.
- Client: `web/src/lib/sync.ts` gains the channel lifecycle and a connected flag in the status snapshot; `SyncStatus` shows it. No schema change in IndexedDB.
- Docs: `docs/sync.md` (new "Live updates" section), `docs/api.md` (new route), `docs/self-hosting/*.md` (proxy notes), `README.md` feature list, `CHANGELOG.md`.
- Footprint: no change to image size; roughly one goroutine and a small buffer (tens of kilobytes) per open connection.
