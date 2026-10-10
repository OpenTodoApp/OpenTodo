# Design

## Context

After `project-sharing` every op carries `scope_id` and `user_id` (author) in the `ops` table, and `Apply` can reject individual ops. After `task-assignment` there is a notification sink. The op log already is a complete history with authors and times; the client receives those ops but discards them after applying, and the served op format does not include the author. Comments need a synced entity; activity needs attribution and a derivation rule that both sides share.

## Goals / Non-Goals

**Goals**
- Comments as ordinary ops: same offline behaviour, same convergence, same transport.
- Activity with no second write path: derived from `ops`, identically on server and client.
- Safe markdown with a tiny footprint.

**Non-Goals**
- Collaborative editing of a comment body (LWW per body; `collaborative-rich-text` later), attachments, cross-project feeds and unread state (`activity-feed`).

## Decisions

### D1. `comment` entity in the op schema
Fields: `task_id` (string), `parent_id` (nullable string), `body` (string, 64 KB limit already enforced per value), `author_id` (string), `mentions` (string list), `created_at` (number), `edited_at` (nullable number), `deleted_at` (nullable number). Scope = scope of `task_id`, resolved like tasks (batch-local lookup when the task is created in the same batch). Same LWW semantics; the whole-body replacement is the known limitation already accepted for `description`.
- Why an entity and not a field on `task`: a list-of-comments field would be replaced wholesale under LWW and lose concurrent comments.

### D2. Authorship enforced on the server, per op
`author_id` must equal the submitting account on the op that creates it, otherwise `forbidden`; later ops on `author_id` are refused. `body`, `edited_at`, `mentions` ops are allowed only from the author. `deleted_at` is allowed from the author, project admins and the owner. Viewers may create comments (they are in scope read-wise) because commenting is the one write a viewer is expected to make; this is the only exception to "viewer writes nothing" and is documented in `docs/sync.md`. Mentions are filtered to current members on receipt; dropped ids are removed from the stored value (the op is stored with the filtered value, which the author's device adopts on the next pull through the normal echo of a modified op).

### D3. `actor` on served ops
`Pull` returns `actor: <user_id>` from the existing column. Request-side `actor` is ignored (the column is always set from the session). Additive, optional, so old clients are unaffected. This is the only protocol change and it is read-only.

### D4. Activity derivation lives in one shared rule
`internal/activity` (Go) and `web/src/lib/activity.ts` implement the same algorithm, verified by a shared JSON fixture in both test suites: group ops by `(actor, entity, entityId)` within a 5-second window into an event; classify by the fields touched (`created_at` present → created; `completed_at` → completed/reopened; `deleted_at` → deleted; `due` → rescheduled; `assignee_id` → assigned; `project_id` → moved; comment create → commented; otherwise "edited <fields>"). Old values come from the device's local row before applying (client) or from the previous op on that field (server). Per-task and per-project views are filters over the same event list.
- Why derive on both sides: offline availability without syncing a second entity, and REST serves history older than the device's retention.
- Alternative: materialize an `activity` table on write. Rejected: second write path, duplicates the log, and cannot be computed for a device offline.

### D5. Local retention
Client keeps an `activity` table bounded to 500 events per project (configurable constant, not an env var); pulled ops are folded into it as they are applied. The server has no retention beyond the op log. REST pagination uses the `seq` cursor already present on ops.

### D6. Markdown renderer
Client only. Budget: 10 KB gzipped. Preferred: a small CommonMark-subset renderer that outputs a sanitised DOM (no raw HTML, link `rel="noopener noreferrer"`, `target="_blank"`), evaluated against the existing CSP (`script-src 'self'`, no inline handlers). If no candidate fits the budget, an in-house renderer of the listed subset (~150 lines) is acceptable. Server never renders.

### Data-model impact
- Op schema: new entity `comment` with the fields in D1. No changes to existing entities or fields.
- Served op: optional `actor`.
- No new tables. Comments live in `ops`/`fields` like everything else. Client gets `comments` and `activity` tables.
- REST: comment and activity routes listed in the specs; comment writes go through `Apply`.

### Dependencies and footprint
Server: none; image size and memory unchanged (activity derivation is a streaming read over `ops`). Client: markdown renderer ≤ 10 KB gzipped plus ~6 KB for thread and activity UI; the design doc of the apply step must record the measured bundle delta.

## Risks / Trade-offs

- [Markdown renderer with an XSS bug] → No raw HTML passthrough, sanitised output, CSP already blocks inline scripts; add fixture tests with hostile bodies.
- [Server and client derive activity differently] → One shared fixture file exercised by both test suites; any divergence fails CI.
- [Fold window makes two quick edits by one person look like one] → Acceptable; the per-field detail is listed inside the event.
- [Viewer comment spam] → Rate limiting per account on comment creation (reuse the fixed-window limiter), admins can delete.
- [Old values missing for history replayed on a new member's device] → Replayed ops arrive in order, so the client builds old values as it applies; for pages fetched from REST the server supplies them.

## Migration Plan

No schema migration: `comment` is new entity data in existing tables. Clients add two local tables on upgrade; existing devices derive activity from ops received after the upgrade and fetch older history from the server on demand.

## Open Questions

- Whether `description` should move to a comment-like history so edits to notes show diffs; deferred to `collaborative-rich-text`.
