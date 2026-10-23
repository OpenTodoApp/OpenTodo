# Proposal

## Why

Since inbox-means-unplaced, the Inbox holds only tasks that still need a decision: no project and no plan. A task without a project that has a due date, a start date or Someday leaves the Inbox, and a muted underlined line under the Inbox title says where it went: "3 planned tasks without a project", which opens the Filter view with `no project`.

The owner finds that line could be nicer. It is easy to miss, it looks like a link in a page header rather than part of the list, and following it takes you away from the Inbox to a different screen with a query field, just to see three tasks. On a phone it is the bar's subtitle, and below 768 px a second copy also sits in the action row.

These tasks are not lost and need no decision about their place, but they have no project, so the Inbox is the natural place to keep an eye on them. They belong in the list, out of the way.

## What Changes

- **A foldable group at the end of the Inbox.** "Planned, no project" with its count is the last group of the Inbox list, folded by default. Opening it shows those tasks in place as ordinary rows: open, complete, reschedule, drag onto a project in the sidebar. Whether it is open is remembered on the device, like Today's Blocked group.
- **The line goes.** The muted line under the Inbox title, the phone bar's subtitle and the copy in the action row below 768 px are removed.
- **Open as filter stays one step away.** The group header has a small "Open as filter" action that opens Filter with `no project`, for people who want the full filter tools.
- **Inbox zero is unaffected.** The group never counts toward the Inbox: when only planned tasks remain, the Inbox still shows its empty state ("Inbox zero"), with the folded group below it. The sidebar count, Process the Inbox and the Inbox membership rule do not change.

Out of scope:
- The Inbox membership rule (project-organization "Inbox is the default container", inbox-means-unplaced). A planned task without a project stays out of the Inbox.
- Making a project mandatory or prompting for one. The owner's note on this point was cut off ("Also because we don't force users to put…"); the design records it as an owner question, and this change keeps today's freedom to leave a task without a project.
- Planned tasks with a project. They live in their project as before.

ROADMAP: an Inbox refinement following inbox-means-unplaced; no row changes.

No new environment variable, no change to the op log or sync format.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: "Standard views" replaces the line with the folded group and its scenario.
- `task-list-presentation`: "Phone header actions" drops the subtitle, and "Skeleton loading" replaces the subtitle scenario with the group's.

## Impact

- Web: `web/src/lib/listGroups.ts` (the planned group), `web/src/app/task-list/useListModel.ts`, `ListGroups.tsx`, `ListChrome.tsx`, `TaskListView.tsx`; tests and stories; five catalogs.
- Docs: `docs/today-and-upcoming.md` ("Where planned tasks go") and the Inbox screenshots.
- No server, sync or migration change.
