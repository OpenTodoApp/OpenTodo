# Design

## Context

`comments-and-activity` gives every device a bounded local `activity` table derived from pulled ops (with `actor`), the server-side derivation in `internal/activity`, and per-task/per-project routes. `project-sharing` gives memberships. `realtime-sync-channel` (planned) gives a server-initiated "sync now" wake-up; its transport is out of this change's hands. The feed is therefore a view plus one piece of synced state: what the user has already seen.

## Goals / Non-Goals

**Goals**
- Feed and unread counts computed locally, correct offline, live when the channel is up.
- Seen state synced between a user's devices through the op log, never visible to other members.
- No new transport, no new tables on the server.

**Non-Goals**
- Follow/mute per task, digests, push; feed for personal projects.

## Decisions

### D1. Seen marker as a personal-scope op: entity `project_prefs`
New entity `project_prefs`, `entityId` = project id, field `feed_seen_at` (number). It is always resolved to the author's personal scope regardless of whether the project is shared, so it syncs to the user's own devices and nobody else. LWW on `(ts, device)` approximates "max seen time" because a later mark always carries a later timestamp; the client additionally never writes a value smaller than the one it holds.
- Why an op: "all writes go through ops", cross-device sync for free, offline for free.
- Alternatives: server-side `last_seen` table via REST (second write path, no offline), browser storage only (does not follow the user to their phone).
- The entity name is generic on purpose so later personal per-project preferences (collapsed, pinned) are additive fields.

### D2. Unread count is a local query
`count(events where project in shared ∧ actor ≠ me ∧ time > feed_seen_at[project])` over the local `activity` table. Live via the same live-query mechanism the sidebar counts already use. Because the local table is bounded, a count is capped at the retention bound ("500+"), which is acceptable.

### D3. Live refresh consumes the wake-up, nothing more
The feed subscribes to "sync completed" from the sync engine. `realtime-sync-channel` turns a server event into a sync; this change does not care how. If that change ships later, the feed works on the existing triggers and the live scenario is the only one deferred.

### D4. One aggregate route for older history
`GET /api/v1/activity?cursor=&project=&actor=&kind=` runs the existing derivation over `ops WHERE scope_id IN (caller's scopes) AND seq < cursor ORDER BY seq DESC`, paged. Filters are applied server-side for the route and client-side for the local view; both use the same event classification.

### D5. Marking seen on open, not on scroll
Opening the feed marks all listed shared projects seen at the newest displayed event's time; opening a project's activity marks that project. Simple, predictable, keyboard-friendly, and it avoids a flood of ops from scroll tracking (at most one op per project per open, debounced).

### Data-model impact
- Op schema: new entity `project_prefs` with `feed_seen_at` (number). No changes to existing entities.
- Server tables: none. Client: no new table; `project_prefs` rows live in a small local `prefs` table.
- REST: one new read route.

### Dependencies and footprint
None added. Server image and memory unchanged; the route is a paged read. Client bundle +3 KB gzipped for the feed view and filters.

## Risks / Trade-offs

- [Unread counts differ between devices right after a mark] → Converges on next sync; the mark is an op and syncs within the normal triggers.
- [A member with many shared projects pulls many events] → Local retention bound per project; the feed route is paged; nothing is pushed unsolicited.
- [Clock skew makes a seen time precede an event that was actually seen] → Seen time is taken from the newest displayed event's server-derived time, not the device clock.
- [`realtime-sync-channel` slips] → Feed ships with polling; live scenario deferred and tracked in tasks.

## Migration Plan

No migration. Devices without any `feed_seen_at` treat everything before the upgrade as seen (initial value = time of first sync after upgrade) to avoid a wall of unread on day one.

## Open Questions

- Whether assignment-to-me events should be pinned at the top of the feed or left to the notifications list from `task-assignment`.
