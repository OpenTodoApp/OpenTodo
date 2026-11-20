## Why

Issue #1443. For retrospectives and reports people need everything that happened in a workspace, and today they open each project's Activity one by one. The one feed across projects, Updates, lists only *shared* projects and other people's changes, filters by one kind at a time, and knows nothing of tracked time. The owner listed the five gaps on the issue:
1. every project of the workspace, personal ones included;
2. a date range;
3. several kinds at once;
4. time tracking as an activity;
5. remembered filters.

## What Changes

- **A workspace Activity page**, opened from the workspace's menu, at `/workspaces/<id>/activity`, in the layout of a project's activity.
  - It covers every project the user can read in the workspace, personal and shared, plus the workspace Inbox.
  - It includes everyone's changes, the user's own too.
  - It never touches unread counts.
- **Filters:** a date range (from, to); several kinds at once (any of them); project; actor. They are remembered on the device, per workspace.
- **Time tracking becomes activity.** "Bob tracked 42 min" is logged when an entry is created or a timer stops, and editing or deleting an entry is logged too. Entry notes are never named, which keeps encrypted notes out.
  - The events are derived alike on the server and the device, pinned by the shared fixture.
  - They form a new feed category, Time tracked.
- **Updates and `GET /api/v1/activity`** accept several kinds at once too. A single kind behaves exactly as before.
- **A new route**, `GET /api/v1/workspaces/{id}/activity`, with cursor pages and the filters above, reading only what a page needs, as the feed route does.

Out of scope:
- CSV or report export (the CSV time-tracking export exists);
- a sidebar destination;
- activity across several workspaces at once.

No **BREAKING** change: no op field; the derived events and routes only grow. The new strings (the page title, the filter labels, the time events) go in every locale.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `activity-log`: added "Workspace activity", "Time tracking in activity" and "Workspace activity route".
- `activity-feed`: added "Several kinds and time tracking in the feed".

## Impact

- `internal/activity`, `web/src/lib/activity.ts` and the shared fixture: the `time_tracked` and `time_changed` kinds, and the `time` category.
- `internal/httpapi/feed.go` (kind lists) and a new workspace route next to it, with its policy, API docs and the OpenAPI file.
- `web/src/app/ProjectActivity.tsx`, reused for a workspace, with the date-range and multi-kind filter; the workspace menu item; the route.
- Device-local filter memory, per workspace.
- Tests, stories, docs (`docs/activity.md` or the guide that covers it), and a changelog fragment.

No dependency. The page loads lazily, so the first load is unchanged.
