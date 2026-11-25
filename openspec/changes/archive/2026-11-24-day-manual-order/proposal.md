## Why

Issue #1480 (asked on Discord, with "it's so essential I thought it was a bug"): people rearrange the next day or two by hand right before doing the work, for example tomorrow's tasks by building. Today has a manual order only when grouped by Project. Under its default Time of day grouping, and in Upcoming, a task can't be placed by hand at all; #1511 only made the refusal say why. The second part of the request is that a Morning task should come before an Evening one in Upcoming and in Today's other groupings, which sort only by due date today.

## What Changes

- **Manual order in Today under every grouping, and in Upcoming.**
  - Order by offers Manual order on both pages (`upcoming_sort_by` takes `position`; an older client reads an unknown value as Due date).
  - Drag, `Alt+Up`/`Alt+Down`, `Alt+Shift+Up`/`Alt+Shift+Down`, Vim `Shift+J`/`Shift+K` and the row menu's Move items place a task within its group and stop at the group's edge: a part of the day, a project, a priority or a label in Today, and a day in Upcoming (a part of that day while day parts are on).
  - A move made under another order switches that page to Manual order first, as a project does.
- **One day order for both pages.** Today and Upcoming share the existing synced `today_manual_order` list (ranked ids, at most 500, whole-list last-writer-wins), so what you arrange in Upcoming's Thursday is Thursday's order in Today. There is no new op field.
- **Drops at a line in another group** write the group's value and the place, in one batch with one Undo:
  - in Upcoming, another day: the new date (as a drop on that day), and while day parts are on, the part of the row it lands beside;
  - in Today grouped by Time of day, another part: the part (`day_part`/`evening`), keeping any due time;
  - in Today grouped by Project, another project (unchanged).
  - A date or part changed anywhere else keeps the task's rank. Completed and deleted ids leave the list on the next move.
- **Part of the day in the due order.** While day parts are on, ordered by Due date, a day's tasks come in Time of day's order: no part first, then Morning, Afternoon and This Evening, by time within a part. Upcoming lays a day out in part order under Manual order too.

Out of scope:
- manual order in Anytime, Someday, Assigned to me or places;
- reordering subtasks from Today or Upcoming;
- a separate order per day.

The third point of the issue, display options that read differently between views, is mostly this change: Manual order was the difference. Upcoming still has no Group by, by design.

No **BREAKING** change: no op field, no setting; only the keyboard guide's notes on dragging and sorted views are reworded.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `builtin-view-options`: added "Manual order of the day"; modified "Display options on Today, Upcoming and the Inbox" and "What each view keeps".
- `manual-ordering`: modified "Which views are manually ordered" and "Drag a task to another day in Upcoming".
- `day-parts`: added "Part of the day in the due order"; modified "Setting the part of the day".

## Impact

- `web/src/lib/listDisplay.ts` (Manual order offered in every Today grouping and in Upcoming).
- `web/src/lib/listGroups.ts`, `dayLists.ts` (the day order and the part order in Today's groups and Upcoming's days).
- `web/src/lib/viewOrderMove.ts` (the host names its page; `dropInDay` writes a date or part and the order in one batch).
- `web/src/app/TaskListView.tsx`, `task-list/dayOrderDrop.ts`, `useListDrag.ts` (the drop line and keyboard moves in Today's and Upcoming's groups).
- The mobile apps, which wrap the same web app.
- `internal/sync/ops.go`: the comment on `today_manual_order` only (generated schema regenerated).
- Tests, `docs/` guides for Today and Upcoming, and a changelog fragment.

No server behaviour change, no dependency. Bundle: the drop resolver and the move writer load lazily with the first drag.
