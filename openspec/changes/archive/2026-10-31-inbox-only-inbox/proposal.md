# Proposal

## Why

Since inbox-planned-group, the Inbox list ends with a folded group "Planned, no project": every open task without a project that has a due date, a start date or Someday. The owner (2026-10-31) found it confusing. He saw dated tasks "in the Inbox" while the page said "Inbox zero", and tasks without a project are common, so they don't deserve a section of their own. The Inbox must show only the Inbox.

## What Changes

- **The group goes.** The Inbox lists only its own tasks (no project, not scheduled). The "Planned, no project" group, its count, its "Open as a new view" header action and the device-local "group open" preference are removed.
- **Inbox zero is whole again.** An empty Inbox shows its full empty state with the Inbox zero illustration, whatever tasks without a project are scheduled. The quiet one-line variant used above the group goes with it.
- **Nothing gets lost.** Scheduled tasks without a project stay reachable in Today and Upcoming by their dates, and in Filter with `no project`.
- **Kept:** the quick-add announcement in the Inbox ("Added to Friday" with a control that opens that view) when the new task is scheduled.

Out of scope:
- The Inbox membership rule (project-organization "Inbox is the default container", inbox-means-unplaced). It does not change.
- The sidebar count and Process the Inbox, which already read only the Inbox's own tasks.

ROADMAP: an Inbox refinement following inbox-means-unplaced and inbox-planned-group; no row changes.

No new environment variable, no change to the op log or sync format.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: "Standard views" drops the Inbox's planned group and its scenarios, and states that an empty Inbox shows its full empty state.
- `task-list-presentation`: "Skeleton loading" rewrites the phone Inbox scenario that named the group.

## Impact

- `web/src/lib/listGroups.ts`, `web/src/lib/inbox.ts`, `web/src/app/task-list/useListModel.ts`, `ListGroups.tsx`, `ListChrome.tsx`, `web/src/app/TaskListView.tsx`; their tests and the two Inbox stories with their baselines.
- Locale catalogues: the string "Planned, no project", and "Open as a new view" alone (the palette keeps "Open as a new view: {query}"), in all six languages.
- Docs: `docs/today-and-upcoming.md`.
