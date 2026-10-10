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

## Implementation notes (apply step)

Decisions taken while implementing, and where the code differs from the plan above:

- **Markdown renderer (D6): in-house.** `web/src/lib/markdown.ts` parses the subset (paragraphs with line breaks, emphasis, strong, inline code, fenced code, links and bare http(s) links, bulleted and numbered lists, block quotes) into plain data; `web/src/app/Markdown.tsx` renders it as React elements, so no HTML string is ever injected and `<script>` stays text. Only absolute `http(s)://` and `mailto:` links become links (`target="_blank" rel="noopener noreferrer"`); `javascript:`, `data:`, relative and protocol-relative URLs render as their text. Nesting is capped so hostile input stays bounded. No dependency was added: the candidates that render to HTML strings would need a sanitizer on top, and the parser plus renderer measure **3.9 KB minified / 1.6 KB gzipped** (rolldown, React external), well under the 10 KB budget.
- **Measured bundle delta** (`npm run build`, before → after): JS 711.40 → 739.20 kB (+27.8 kB), gzip 211.14 → 219.10 kB (**+7.96 kB**); CSS 51.43 → 51.95 kB, gzip 9.29 → 9.38 kB (+0.09 kB). That is renderer, thread, activity panels, data layer and tests' production code together, inside the 10 KB + ~6 KB estimate. Server binary: no new dependency; one small package (`internal/activity`).
- **Local activity (D4/D5).** The `activity` table stores the applied ops (author, old value from the local row, project and task keys), not finished events; events are derived from those rows with the shared rule when a view reads them, which keeps one derivation function on the client and makes the fixture test cover what users see. Retention is still per event: when a project holds more than 500 events, the ops of the oldest events are deleted. Pending is computed at read time (an event is pending while any of its op ids is still in the outbox), so acknowledging the outbox needs no write. Ops refused by the server are removed from the table; purges and departures remove what belonged to the purged entities.
- **Activity cursor.** Events are ordered newest first by `(ts, id)`, not by `seq`: an event spans several ops and its time is that of its first op in last-writer-wins order, so the REST cursor is the opaque `"<ts>:<id>"` of the last event of a page. Pages never overlap because `(ts, id)` is a total order. The server derives over the entity's full history on each request (a streaming read of the op log, like revision history) and pages the result.
- **Kinds.** `archived` / `unarchived` (project `archived`) were added between `moved` and `edited`, and `restored` for a cleared `deleted_at`, so project activity does not read "edited archived". Comment events carry no field changes (the thread shows the comment); their kinds are `commented`, `comment_edited` and `comment_deleted`.
- **Mentions echo (D2).** The filtered `mentions` op keeps the author's `(ts, device)`, so plain last-writer-wins would never replace the author's local value. The server returns the stored op in the same sync response (with the refused-field restores), and the client adopts a server value that carries the clock its row already holds, for `comment.mentions` only.
- **Viewer rule and rate limit.** Comment ops bypass the role table and use their own per-field rules (author edits; author, admin, owner delete; anyone who can read the task creates). Creation is limited per account to 60 per minute (fixed window, in memory, shared by sync and REST); a refused creation refuses every op of that comment with reason `rate_limited` (REST: 429).
- **Notifications.** `notify.MentionSink` is an optional interface next to `Sink`, so existing sinks keep compiling; `notify.Multi` hands mentions to sinks that implement it and `InApp` stores `kind: "mentioned"`.
- **Schema.** No table was needed, but `0015_comments.sql` adds a partial index `scope_fields(entity, value) WHERE field = 'task_id'` used to find a task's comments (thread route, purge cascade, first-share relabel, activity) and reminders. Comments of a task are relabelled with it on first share, purged with it, and exported.
- **Keyboard.** `c` already completes the selected task, so the composer shortcut is `Shift+C`; the project activity panel toggles with `Shift+H`. Both are listed in `?`.
- **Reseed after restore** re-sends only the device user's own comments, since the server refuses anyone else's author.

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
