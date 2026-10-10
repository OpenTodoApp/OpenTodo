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
- Server tables: none. Client: `project_prefs` rows live in a small local `prefs` table (Dexie v12, every store redeclared; v11 is reserved by a parallel change).
- REST: one new read route.

### D6. Keyboard: `g h`, not `g f`
`g f` already opens the Filter view, so the feed is `g h` (h as in history; `Shift+H` already toggles a project's activity). The `?` overlay lists it.

### D7. Implementation notes
- Server: `project_prefs` needed no resolver code, since every entity outside project/task/section/comment already falls to the author's personal scope; a comment there and `TestProjectPrefsAreAlwaysPersonalScope` pin it. Purging a project also purges every member's `project_prefs` for it (with markers), so a stale device cannot resurrect a mark for a project that no longer exists. No SQL migration.
- The route derives each shared project's ops on their own, exactly like `GET /api/v1/projects/{id}/activity`, so event ids, folds and kinds agree between the two routes and the local view. The cursor is the existing `(ts:id)` cursor of the activity routes (accepted as `cursor` or `before`); "unknown cursor" means malformed, as for the existing routes. The `kind` filter takes the six feed categories (`internal/activity/feed.go`, mirrored by `FEED_KINDS` in `web/src/lib/feed.ts`).
- Initial seen time: per device and per shared project (`meta.feedBaseline`), set after the first completed sync that knows the project. This covers both the upgrade and joining a project later (whose backfilled history would otherwise be unread). A synced `feed_seen_at` always takes precedence.
- Live refresh: the feed and counts are Dexie live queries over `activity`, `prefs`, `memberships` and `meta`; every sync that writes ops re-runs them, whichever trigger started it (server wake-up, timer, focus, reconnect). No extra subscription was needed.
- While the feed is open, newly arriving events are marked seen too (debounced, at most one op per project per 400 ms window); entries that were unread when the feed opened keep a dot.

### Dependencies and footprint
None added. Server binary and memory unchanged; the route is a paged read (it derives every shared project's events per request, like the per-project route does for one project). Client bundle measured with `vite build`: main chunk 794.65 kB → 806.69 kB minified, **233.57 kB → 236.55 kB gzipped (+3.0 KB)**.

## Risks / Trade-offs

- [Unread counts differ between devices right after a mark] → Converges on next sync; the mark is an op and syncs within the normal triggers.
- [A member with many shared projects pulls many events] → Local retention bound per project; the feed route is paged; nothing is pushed unsolicited.
- [Clock skew makes a seen time precede an event that was actually seen] → Seen time is taken from the newest displayed event's server-derived time, not the device clock.
- [`realtime-sync-channel` slips] → Feed ships with polling; live scenario deferred and tracked in tasks.

## Migration Plan

No migration. Devices without any `feed_seen_at` treat everything before the upgrade as seen (initial value = time of first sync after upgrade) to avoid a wall of unread on day one.

## Open Questions

- Whether assignment-to-me events should be pinned at the top of the feed or left to the notifications list from `task-assignment`.
