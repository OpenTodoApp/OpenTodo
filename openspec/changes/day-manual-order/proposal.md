## Why

Issue #1480 (asked on Discord, with three 👍 and "it's so essential I thought it was a bug"): people rearrange the next day or two by hand right before doing the work. Today has a manual order only when grouped by Project. Under its default Time of day grouping, and in Upcoming, a task can't be placed by hand at all; #1511 only made the refusal say why. The second part of the request is that a Morning task should come before an Evening one in Upcoming and in Today's other groupings, which today sort only by due date.

## What Changes

- **Manual order in Today under every grouping, and in Upcoming.**
  - Order by offers Manual order on both pages.
  - Drag, `Alt+Up`/`Alt+Down` and the row menu's Move up/down/to top place a task within its group: a part of the day, a project, a priority or a label in Today, and a day in Upcoming.
  - A move in another order switches to Manual order first, as a project does.
- **One day order for both pages.** Today and Upcoming share the existing synced `today_manual_order` list, so what you arrange in Upcoming's Thursday is Thursday's order in Today. There is no new op field.
- **Drops into another group** do what a drop on that group's heading already does, and place the task at the line, with one Undo:
  - in Today grouped by Time of day, set the part of the day;
  - in Today grouped by Project, move the project;
  - in Upcoming, move the task to that day.
- **Part of the day in the due order.** Ordered by Due date, a day's tasks come in the order Time of day groups them: no part first, then Morning, Afternoon and This Evening, with timed tasks by time inside their part. This applies only while day parts are on.

Out of scope:
- manual order in Anytime, Someday, Assigned to me or places;
- reordering subtasks from Today or Upcoming;
- a separate order per day.

The third point of the issue, display options that read differently between views, is mostly this change: Manual order was the difference. Upcoming still has no Group by, by design.

No **BREAKING** change: no op field, no setting, no new string except "Manual order" already in the catalogs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `builtin-view-options`:
  - added "Manual order of the day" and "Part of the day in the due order";
  - modified "Display options on Today, Upcoming and the Inbox" and "What each view keeps".
- `manual-ordering`: modified "Which views are manually ordered".

## Impact

- `web/src/lib/listDisplay.ts` (Manual order offered in every Today grouping and in Upcoming).
- `web/src/lib/viewOrder.ts` / `viewOrderMove.ts` (Today's order host reused for Upcoming).
- `web/src/app/task-list/useListModel.ts` and the drop resolvers for Today's and Upcoming's groups.
- The Due date comparator for a day's tasks (`web/src/lib/views.ts`).
- The mobile app's Today and Upcoming, which use the same list code.
- Tests, `docs/` guides for Today and Upcoming, and a changelog fragment.

No server change, no dependency. Bundle: the move code is already lazy (today-project-drops); measured with the build.
