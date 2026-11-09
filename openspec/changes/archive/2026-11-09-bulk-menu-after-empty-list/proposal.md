# Proposal

## Why

Issue #841: on a label page, with every task ticked, removing the label through the selection bar's Actions → Labels empties the list. The ticked set empties with it, and the still-open Actions menu turns into the single-task menu of the cursor task (the last ticked one), drawn at the far left of the window because it has no anchor. Once nothing is ticked, the side panel also follows the cursor again and opens that task, although it is no longer in the list.

## What Changes

- The Actions menu remembers what it opened on: the ticked tasks or, with nothing ticked, the cursor task. When the ticked set empties (or fills) while it is open, the menu closes instead of becoming the other menu. This applies to the task lists and to the lists built on `useBulkList` (Filter, saved views, method lists).
- The side panel, and the Inbox's own split, follow the cursor only while the cursor's row is in the list, so a cursor left on a task that a bulk action took out of the list opens nothing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `bulk-actions`: a bulk action that takes every ticked task out of the list closes the menu and opens no task.

## Impact

- Web app only: `web/src/app/bulk/useBulkList.tsx`, `web/src/app/TaskListView.tsx`, `web/src/app/task-list/useInboxSplit.tsx`, a new test `web/src/app/bulk/emptiedList.test.tsx`.
- No op field, sync, API, CLI, MCP, encryption, dependency, string or server change; no bundle size change worth reporting.
