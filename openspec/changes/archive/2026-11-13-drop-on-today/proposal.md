## Why

A task dragged from a list can be dropped on Inbox, a project or a label in the sidebar, but not on Today, so dragging a task from a project to Today does nothing (GitHub issue 1328).

## What Changes

- The sidebar's **Today** entry is a drop target for tasks dragged from a list or a board. A drop plans the task, or the bulk selection it is part of, for today by the rule of a drop on a day group in Upcoming (`upcoming-drag`): the do-on date moves to today and keeps its time, a span moves whole, the deadline stays, a deferred task becomes due today. It is one batch with Undo and the toast "Scheduled for today".
- The same drop ring and no list drop line as the other sidebar drops; Escape cancels; a read-only task changes nothing.

Out of scope: dropping on Upcoming (tomorrow) or other built-in lists.

## Capabilities

### Modified Capabilities

- `project-organization`: a task can be dropped on Today in the sidebar.

## Impact

- `web/src/app/taskDrop.ts`, `web/src/app/Sidebar.tsx`, `web/src/lib/undoActions.ts` (`todayDropUndoable`, reusing `planDayDrop`). No server change, no dependency, no new op field.
