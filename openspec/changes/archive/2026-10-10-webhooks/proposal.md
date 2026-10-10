# Proposal

## Why

A self-hosted task manager becomes far more useful when it can talk to the rest of a home or small-team stack: switch a light on when the "water plants" task is completed, post to a Telegram chat when a task in a shared project is created, kick off an n8n flow when a project is archived. Today the only way to react to changes is polling the REST API. Outbound webhooks give users an event stream that they configure themselves, that fires only toward endpoints they chose, and that never bypasses the op log's view of what happened.

## What Changes

- Per-user outbound webhooks: a target URL, a subset of events (`task.created`, `task.updated`, `task.completed`, `task.reopened`, `task.deleted`, `project.created`, `project.updated`, `project.archived`, `project.deleted`), an optional project filter, an enabled flag, and a secret shown once.
- Events derived from operations as they are applied, whatever their origin (device sync, REST, import, CalDAV), coalesced per entity per batch, with a JSON payload carrying the event, a unique delivery id, the current entity and the changed fields.
- HMAC-SHA256 signatures over a timestamp and the body, delivered with a stable header set, so receivers can verify authenticity and reject replays.
- At-least-once delivery with a persistent queue, retries with exponential backoff and jitter, a per-webhook delivery log with status, duration and a response excerpt, manual redelivery, a test ping, and automatic disabling after sustained failure with a visible reason.
- SSRF protection: only `http`/`https`, host resolved before dialling and connections pinned to the resolved address, redirects not followed, loopback, link-local, private and metadata ranges refused unless the owner enables "allow private network targets" for installations where Home Assistant or n8n run on the same LAN.
- Management in Settings (per user) and through `/api/v1/webhooks/*`; owner-only policy toggle in Settings.

Out of scope: inbound webhooks (`email-to-task`, `share-capture` and a later inbound-automation change cover capture), per-event templating or payload transformation (receivers like n8n do this), webhooks for other users' data or shared projects (`project-sharing`), server-level events such as backup results (noted as a follow-up in `backups`), delivery through anything other than HTTP(S).

Advances ROADMAP.md section 6, "Outbound webhooks (Home Assistant, Telegram, n8n)" (`webhooks`).

No breaking changes: no new mandatory environment variable (optional `OPENTODO_WEBHOOKS_ALLOW_PRIVATE=true` presets the owner toggle), no change to the op log format; events are derived from ops and stored in separate tables.

## Capabilities

### New Capabilities
- `webhooks`: webhook configuration and management routes, event derivation and payloads, signatures, delivery and retries, delivery log and redelivery, SSRF policy, and the settings screen.

### Modified Capabilities
- `self-hosting`: the "No telemetry" requirement is clarified so that outbound requests go only to destinations the owner or a user configured. The `backups` change carries the identical clarification; whichever archives first applies it and the other is a no-op.

## Impact

- Server: new `internal/webhook` package (event derivation hook after `sync.Apply`, queue worker, signer, SSRF-safe HTTP client, log pruning), routes under `/api/v1/webhooks/*` and an owner-only `/api/v1/settings/webhooks`, tables `webhooks` and `webhook_deliveries` in a new migration, the shared `settings` table if not yet present. No new Go dependency (`crypto/hmac`, `net`, `net/http`).
- Client: Settings → Webhooks section (list, create with secret shown once, edit, enable/disable, test, delivery log, redeliver), owner policy toggle.
- Docs: `docs/webhooks.md` (events, payload schema, signature verification examples, retry policy, SSRF policy, receiver recipes for Home Assistant, Telegram via a bridge, n8n), `docs/api.md`.
