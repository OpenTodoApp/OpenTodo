# Design: inbox-drop-unplaces

## Context

Since `inbox-means-unplaced`, a task is in the Inbox only while it has no project and no schedule (`web/src/lib/inbox.ts`). The move paths were not updated: `dropUndoable('inbox')` called `moveManyUndoable(ids, null)`, which skipped tasks whose project was already null and never touched dates; `moveUndoable` (the panel picker, the list's edit bar) and bulk `reviewMove` did the same, and the panel and edit bar ignored "No project" picked on a task that already had none (`usePropertiesModel.moveTo`, `InlineEditor`, `ProjectPickerField`). Group headings and the panel's place said "Inbox" for every task without a project.

## Decisions

**D1. One planner.** `MoveTarget` gains `inbox?: boolean`. With `projectId: null` and `inbox`, `planMoveGroups` (`web/src/lib/bulk.ts`) adds `unschedulePatch(task)` to the move patch, and also writes it for a scheduled task already without a project. `unschedulePatch` writes nothing for a task that is not scheduled (`isScheduled`), and only the fields that change. Across sharing scopes the patch goes into the copy, so the copy is unscheduled and the original is tombstoned as before. `moveUndoable`, `moveManyUndoable` (the sidebar drop) and bulk Move to the Inbox pass `inbox: true`; a move to another workspace's Inbox (the palette's Move to workspace) changes only `workspace_id`; `viewOrderMove` (a drop into a list's "No project" group) and automation rules do not, so they keep the date. `pickMoves(task, id)` in `lib/inbox.ts` decides whether a pick moves: another project, or "No project" for a task that is not an Inbox task; the panel and the edit bar use it, and `ProjectPickerField` reports a repeated "No project" pick when asked (`repickNone`).

**D2. Repeating tasks keep their schedule.** Clearing a series' `due` ends it (`parkUndoable` and `time-sectors` D2 follow the same rule), so a repeating task keeps its whole schedule (`due`, `start`, `sector`, `evening`, `day_part`) and loses only its project; a repeating task already without a project writes nothing. The messages use `=1` for the named form and the language's plural categories for counts, so Japanese and Chinese (only `other`) still count and Russian `one` (1, 21, 31) never names a title. The toast names the task when it is the only one ("“Water plants” repeats, so it stays scheduled", or "Moved to Inbox; “Bins” repeats, so it stays scheduled") and counts them otherwise ("Moved to Inbox; 2 repeating tasks stay scheduled"), counting ticked tasks once (not under a ticked parent). The bulk review's result appends the count ("4 changes applied; 1 repeating task stays scheduled") through `ReviewPlan.repeating`; when only repeating tasks without a project are ticked there is nothing to review, and the toast names or counts them instead.

**D3. Names.** `noProjectHeading(tasks)` (`lib/views.ts`) heads a group of tasks without a project "Inbox" when every one is an Inbox task, else "No project". `groupTasks` (saved views, the Filter view, Today's and Upcoming's chosen grouping), the cross-project lists (Someday, Anytime, label pages, Assigned to me) and the Completed logbook use it. The task panel's place uses the model's `projectName`, which follows the same rule. A drop into a list's group of tasks without a project names that group's heading in its toast (`useListScreen`, `SavedViewView`, as Today's `todayGroupDrop` does), since it keeps the date.

## Data model and convergence

No new field and no new op type: the batch writes `project_id`, `workspace_id` (as today, #508), `due`, `start`, `sector`, `evening` and `day_part` together, locally first, through the outbox; every field converges by last-writer-wins, and Undo writes the previous values back. A date set on another device after the move wins by its later clock, as any edit does.

## Interface budget

No new control, row, shortcut, sidebar destination or scroll region; toast, result and heading texts only.

## Dependencies

None; no effect on image size or memory.
