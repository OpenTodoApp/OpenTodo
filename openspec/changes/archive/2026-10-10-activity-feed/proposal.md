# Proposal

## Why

With sharing, comments and an activity log in place, a member still has to open each project to find out what changed. A household or team wants one place that says "Bob checked off the groceries, Alice commented on the invoice, two tasks were assigned to you" and that shows what is new since they last looked, updating live while the app is open. The pieces exist; this change composes them into a feed with unread markers.

## What Changes

- A feed view listing recent activity across every shared project the user belongs to, newest first, grouped by day, with the project name on each entry and filters by project, actor and kind.
- Unread markers: each shared project remembers when the user last viewed its activity; the sidebar shows an unread count per shared project and a total on the feed entry; opening the feed or a project's activity marks it seen. The seen marker is stored as an operation in the user's personal scope so it syncs between the user's own devices and never leaks to other members.
- Live updates: when the realtime channel wakes the device, the feed refreshes from the ops just pulled; without the channel it refreshes on the regular sync triggers, so the feed is correct, only less immediate.
- Own changes are shown in the feed but never counted as unread.

Depends on `comments-and-activity` (events and the local activity table), `project-sharing` (memberships) and `realtime-sync-channel` (the wake-up channel; this change only consumes "a sync was triggered by the server", it defines no transport). It cannot be applied before all three are archived; if `realtime-sync-channel` is delayed, the feed ships with polling and the live scenario is marked pending.

Out of scope: per-task follow/mute, email digests, feed for personal projects (own activity is already in the project view), push notifications (`reminders`), activity export, an administrative audit log (`audit-log`).

Advances ROADMAP.md section 5 "Live activity feed in shared lists" (`activity-feed`).

No new environment variables. Op log change is additive only (new personal entity `project_prefs` with one field), not **BREAKING**.

## Capabilities

### New Capabilities
- `activity-feed`: the cross-project feed, unread tracking and its sync, live refresh, filters and keyboard access.

### Modified Capabilities
- none.

## Impact

- Server: `project_prefs` entity in the op schema (personal scope, keyed by project id); `GET /api/v1/activity` aggregating the caller's shared scopes with cursor pagination; no change to the realtime channel.
- Client: feed view, unread computation from the local activity table and `project_prefs`, sidebar counts, wake-up handling.
- Dependencies: none.
- Docs: `docs/sync.md` schema table, `docs/api.md`.
