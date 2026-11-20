## Context

- **Derivation.** Activity is derived from ops (`internal/activity`, mirrored by `web/src/lib/activity.ts` and pinned by a shared fixture).
- **Per-project view.** `GET /api/v1/projects/{id}/activity` serves it, and `ProjectActivity.tsx` renders it with actor and single-kind filters.
- **The feed.** `GET /api/v1/activity` covers shared projects, pages by `(ts, id)` cursors, and reads only the recently changed entities' histories (activity-feed "Feed pages read what they need").
- **Local copy.** The device keeps a bounded local copy of recent events per project.
- **Time entries.** They are op-log entities in their task's scope, but they produce no activity event today.

## Goals / Non-Goals

**Goals:** one place to review a workspace over a period, with every project, every actor, several kinds and tracked time; filters that stay put on the device.

**Non-Goals:** exports, report layouts, a sidebar destination, cross-workspace views, and changing what Updates covers (it stays "others' changes in shared projects").

## Decisions

### D1. A page of the workspace, not a new destination

The workspace menu (the switcher under the workspace name, which lists the workspaces, New workspace and Manage workspaces) gains **Activity**, for the current workspace. The page reuses the project activity layout: day groups and the same rows. Its filter bar replaces the single kind menu with a multi-select and adds a date range. There is no sidebar entry, so the sidebar budget is unchanged.

### D2. One route per workspace, shaped like the feed

`GET /api/v1/workspaces/{id}/activity` resolves the workspace's projects and Inbox that the caller can read: owned and personal ones, and shared ones the caller is a member of, as the scopes say. It then pages them with the feed's reader.
- **Most recent first:** histories are read most-recently-changed first, stopping once the page is certain.
- **Same filters as the feed:** `kind` and `project` take comma lists, and `from`/`to` bound the op time, which the reader uses to skip entities with no change in the range.
- **Errors:** an unknown kind or `from > to` is 400 `invalid_input`; a workspace the caller doesn't belong to is 404.

### D3. Time entries as events

`time_entry` creates and a set `ended_at` derive `time_tracked`, with `minutes = round((ended_at − started_at) / 60000)`; a running timer has no event until it stops. Other field changes and deletion derive `time_changed`. The event belongs to the entry's task, so task, project, feed and workspace views all see it. The note is never part of an event. The server and device derivations change together with the fixture, and the feed category `time` joins the table in `internal/activity/feed.go` and `web/src/lib/feed.ts`.

### D4. Several kinds

The kind filter becomes a set: an event matches when its category is in the set, and the empty set means all. For `GET /api/v1/activity`, `kind=a,b` is the set and `kind=a` is a set of one, so existing clients see no difference. Updates gets the same multi-select.

### D5. Remembered filters

The page's filters are kept in device storage under the workspace id, like a list's collapsed groups: never synced, restored on open. A range is stored as the chosen days, so "10–16 Nov" stays that week, not a rolling window.

### D6. Offline

Offline, the page shows the locally retained events of the workspace's projects with the filters applied. Online, it pages the route and merges by event id, as Updates does for older history.

## Risks / Trade-offs

- **Cost of a wide range on a large workspace.** The reader stops at the page size and skips entities untouched in the range, so a page costs what a feed page costs. This is pinned by a large-history test like the feed's.
- **New event kinds on old clients.** An older device that does not know `time_tracked` shows it under Other, as it does with any unknown kind.
- **Size.** The page is lazy. The derivation adds a few lines on both sides.

## Interface budget

One menu item in the workspace menu, one page. In the filter bar, a multi-select replaces the kind menu and a date range is added. No new sidebar entry or shortcut.
