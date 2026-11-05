# Design

## Context

Upcoming groups its tasks by the day `upcomingDate` (`web/src/lib/views.ts`) gives: a span's first day, the due date, the start of a deferred task without a project or due date, else the deadline. List rows already drag through `lib/dnd` (`beginDrag`): a mouse after a few pixels, touch after a 350 ms hold, Escape cancels. In a list that is not manually ordered the drag only finds `data-task-drop` targets (sidebar projects, labels, Today's part headings), resolved by `dropUndoable` in `web/src/lib/undoActions.ts`.

Month and Plan each had their own `dropOn`: same time, same zone (`dueFromView`), a date-only due for a task without one, nothing for a completed task or the same day; Plan also moved a span whole from the day it was dragged from.

## Goals / Non-Goals

**Goals:**

- One move-to-day rule for the calendar and Upcoming.
- Drag in Upcoming with the gestures the list already has; a keyboard path.

**Non-Goals:**

- No reordering within a day, no drop on a day that has no heading, no new field, route or dependency.

## Decisions

### D1. One rule, `dayMovePatch`, and Upcoming's choice of field

`web/src/lib/dayMove.ts` holds `dayMovePatch(task, to, { from, field, zone })`: a span shown from `from` moves whole (start and due by the same days, `moveSpanPatch`); otherwise the named field moves, `due` by default, keeping the time and, for a zoned due, its zone (read and written in the viewer's zone, as before). A completed task and the same day give null. Month and Plan call it instead of their own code; their behaviour is unchanged.

`upcomingMovePatch` picks the field the way `upcomingDate` lists the task:

- a span or a due date: the due (a span whole);
- no due, a deferred task without a project: its start;
- no due, a deadline: the deadline. A task listed under its deadline day has no due date, and a drop must not invent one: the deadline moves, so the task stays listed by it;
- none of these (a started task shown in Start with Today's Today group): a date-only due, as the calendar gives a task from its planning list.

A repeating task moves its current occurrence as a single date change does; its rule is untouched, as in the calendar. Projected occurrences in Upcoming are not draggable rows, so they never move from here.

### D2. The drop target is the whole day group

Each date group of Upcoming (and Today's group in Start with Today) carries `data-task-drop="day:<date>"` on its section, so a task dropped on the heading or on any of the day's tasks lands on that day; the section rings while the drag is over it, like the sidebar targets. `dropUndoable` handles `day:` with `upcomingDayUndoable`: every dragged task (the bulk selection when the dragged row is ticked, as for sidebar drops) through `upcomingMovePatch`, one batch, one Undo. The toast reads "Date changed" for a single due change and "Rescheduled" otherwise, the calendar's words. A drop on the task's own day writes nothing and shows no toast: Upcoming's order is fixed, there is nothing to reorder.

Earlier, the parts of the day, This Evening and Blocked in Start with Today take no day drop: each implies more than a date.

Tasks the user may only view are not draggable rows (the list's existing rule), and `upcomingDayUndoable` skips them too, so a ticked selection that mixes them moves only the others.

### D3. Keys: Shift+← / Shift+→

The task list has no key that moves a task's date. ←/→ show and hide a row's details, Shift+↑/↓ extend the ticked range, and Alt+↑/↓ reorder. Shift+←/→ are free in the list scope, and on a board and in Month they already mean "move the selected item to the previous / next column or day". In Upcoming they move the selected task a day earlier or later by the drop's rule. A task listed before today steps from today, and a step never lands before today. They are a `view` entry for `upcoming` in the registry, so the conflict test, the `?` sheet and the keyboard guide list them.

### Interface budget

No new chrome, property, sidebar destination or scroll region. The only visual change is the ring on the day group under a dragged task. One shortcut entry, registered without a conflict.

### Data model, size

No new field: the patch writes `due`, `start` or `deadline`, which exist. No dependency; a few hundred bytes of client code.

## Risks / Trade-offs

- A day with no tasks has no heading to drop on. The keys and the date picker reach it. A heading for every day would make Upcoming long and is out of scope.
- Dragging a ticked row moves the whole selection to the day, each task by its own field. This matches the sidebar drops.
