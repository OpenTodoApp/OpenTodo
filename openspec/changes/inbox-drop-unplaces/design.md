# Design: inbox-drop-unplaces

## Context

Since `inbox-means-unplaced`, a task is in the Inbox only while it has no project and no schedule (`web/src/lib/inbox.ts`). The move paths were not updated: `dropUndoable('inbox')` called `moveManyUndoable(ids, null)`, which skipped tasks whose project was already null and never touched dates; `moveUndoable` (the panel picker, the inline editor, title edits) and bulk `reviewMove` did the same. `Facets.tsx` labelled any project-less task "Inbox", while `usePropertiesModel` already said "No project" for one outside the Inbox.

## Decisions

**D1. One planner.** `MoveTarget` gains `inbox?: boolean`. With `projectId: null` and `inbox`, `planMoveGroups` (`web/src/lib/bulk.ts`) adds `unschedulePatch(task)` (due, start, sector, evening, day_part cleared, only fields that change) to the move patch, and also writes it for a task already without a project. Across sharing scopes the patch goes into the copy, so the copy is unscheduled and the original is tombstoned as before. `moveUndoable`, `moveManyUndoable` (the sidebar drop) and bulk Move to the Inbox pass `inbox: true`; `viewOrderMove` (a drop into a list's "No project" group) and automation rules do not, so they keep the date. The panel's picker no longer returns early on "No project" for a scheduled task without one.

**D2. Repeating tasks keep their date.** Clearing a series' `due` ends it (`parkUndoable`, `time-sectors` D2 follow the same rule). The move still clears the project; the toast reads "Moved to Inbox; it repeats, so it stays scheduled", or "It repeats, so it stays scheduled" without Undo when nothing was written.

**D3. Names.** The task panel's place facet uses the model's `projectName` ("Inbox" only for an Inbox task, else "No project"). Today's chosen grouping by project (also Upcoming's Today groups) heads the `inbox` key "No project". The Inbox, label, Someday, Anytime and Assigned groupings are unchanged.

## Data model and convergence

No new field and no new op type: the batch writes `project_id`, `workspace_id` (as today, #508), `due`, `start`, `sector`, `evening` and `day_part` together, locally first, through the outbox; every field converges by last-writer-wins, and Undo writes the previous values back. A concurrent date set on another device after the move wins by its later clock, as any edit does.

## Interface budget

No new control, row, shortcut, sidebar destination or scroll region; one toast text and one heading text change.

## Dependencies

None; no effect on image size or memory.
