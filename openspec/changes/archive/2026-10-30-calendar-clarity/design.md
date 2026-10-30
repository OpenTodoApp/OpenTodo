# Design

## D1. Deadlines as markers, not blocks

A deadline is a date, not work, so it never becomes a block or counts toward capacity. `deadlineMarkers(tasks, from, to)` in `web/src/lib/calendar.ts` returns, per date, the open, not deleted tasks of non-archived projects whose `deadline` falls in the range (a floating date, no zone conversion). Rendering:

- **Day and Week**: a chip in the all-day strip (the strip events already use, `calendar-feeds` "Events drawn in Day and Week"), with the diamond in the warning tone, the title, and "Deadline" in its accessible name. Deadline chips come before event chips and share the strip's three-chip limit and "+N". When the same task is drawn on that day as a block or a lane row, no chip is added; the block carries the diamond after its title.
- **Month**: after the cell's task rows, one row per deadline with the diamond at its end, in the faint tone with the title; it takes part in "+N more". The task's own row on the same day carries the diamond instead.
- **Plan**: the column lists deadlines after its tasks in the same way.
- Past days: markers are dimmed like past blocks; a deadline that has passed on an open task keeps the danger edge rule of the countdown (`deadlines` "Deadline countdown") on the task's own row, not on the marker.

Activating a marker opens the task (panel or page, following `task_open`). Markers are not draggable and not drop targets; moving a deadline stays in the When popover.

Alternative: draw deadlines as zero-length lines across the grid at end of day. Rejected: they would compete with the now line and be invisible in Month.

Calm by default: the markers appear only for tasks that have a deadline, which only users who set deadlines have. No setting.

## D2. Adding with the pointer reuses the add dialog

`AddOnDayDialog` (already used by Month's `q` and Plan) gains an optional time. Gestures:

- Day and Week: a double-click on an empty part of the grid (no block, event chip or frame title under the pointer) opens the dialog with the slot's date and its 15-minute start; the created task is due then, with no estimate. A double-click in the unscheduled lane opens it with the date only.
- Month: a double-click on an empty part of a cell opens it with that date.
- A right-click (`contextmenu`) on the same places opens a menu at the pointer with **Add task here…**; later changes add **New frame here…** (`calendar-frames`) and **New slot here…** (`calendar-slots`). On touch, a 500 ms long press on an empty place opens the same menu as a bottom sheet; a long press on a block keeps its existing meaning.
- Hover: Month cells get the hover surface used by list rows; Day and Week show a faint 15-minute highlight under a fine pointer.
- Keyboard: `q` in Day and Week opens the dialog for the focused day (the selected block's day, else today when shown, else the first day), registered in the `calendar` scope without conflict; Month's `q` is unchanged. Typed time phrases in the dialog set the time, as quick add does.

Viewers: the dialog adds to the user's default project like any quick add, so no permission question arises. Offline: the task is created locally with no round trip.

## D3. Colour by

A `colorBy(task, mode, labels)` helper returns the hue the block, row or card uses:

- `project` (default): today's behaviour.
- `label`: the task's labels ordered by the user's label order; the first one with a colour other than the default grey gives the hue; otherwise the neutral (Inbox) hue.
- `priority`: P1, P2 and P3 take the hues of the priority ring tokens; P4 the neutral hue.

The edge and fill rules (`time-blocking` "Tasks as calendar blocks", 3:1 edge) apply to whichever hue is chosen, so contrast stays guaranteed. On boards, the card's left edge takes the hue (cards have no fill today); with `project` the board is unchanged.

Storage: per device, `calendar.colorBy` (shared by Day, Week, Month, Plan) and `board.colorBy` (every board: project boards and board views). The issue allows "per view or per device"; per device needs no op field and matches the other calendar preferences. Per saved view is out of scope.

Where: the Calendar's overflow menu and a board's display panel (`custom-views` "Display panel") get a **Colour by** choice; a project board's header, which has no display panel, gets it in its overflow menu.

## D4. One filter for the Calendar, one for Upcoming

The filter is the list filter that saved views use: a query in the filter language (`filter-queries`), with label checkboxes that write `@label` terms into it. It is opened from **Filter…**: in the Calendar's overflow menu (the header's actions are full: Today, previous, next, the mode switch) and in Upcoming's existing Filter action, where it sits under the duration filter. An active query shows as one chip in the header's lead line (inside the header, so no new row of chrome) with its words and a clear control; with a duration filter also active on Upcoming, the two chips sit side by side.

Evaluation is on the device from local data, offline. It narrows the tasks drawn and listed, the planning list is unaffected, events are never filtered, deadline markers follow the filter (a marker shows only for a task the filter keeps). Capacity still counts every task of the day, and its tooltip adds "n hidden by the filter": capacity is about the day, not the filtered subset.

An invalid query keeps the last valid one active and shows the parser's error in the popover; the chip stays.

Remembered per device under `calendar.filter` and `upcoming.filter`; never synced.

## D5. A project's Calendar layout

`ProjectViewMode` gains `calendar`; older devices read it as `list` (already the rule). In the Calendar layout the project page renders the Calendar component in the last Calendar mode (Day, Week, Month or Plan), with an implicit filter on the project and its sub-projects by id (what `##name` means, without the risk of two projects sharing a name) that is not shown as a chip and combines with the Calendar's own filter. The page keeps the project header; the calendar's range controls take the header's action slots as in the Calendar destination; the planning list opens with the project as its source. `v` cycles List, Board, Timeline, Calendar.

On a phone, the Calendar layout follows the calendar's phone rules (Week agenda, Month counts).

## D6. Data model, size, budget

No op field; device meta only. No dependency; about 3 KB gzip.

Interface budget (docs/interface-guide.md):
- Rows of chrome: unchanged. Filter and Colour by are overflow items; the active filter chip is in the header's lead line, like the duration filter's chip.
- Task properties: unchanged; the diamond on a block is a mark, not a property.
- Sidebar destinations: unchanged.
- Scroll regions: unchanged; menus and the dialog are overlays.
- Shortcuts: `q` added to the `calendar` scope, where it has no binding (the registry test checks it).

Progressive disclosure: deadlines appear only for users who set them; the other parts are in menus. Simple-list users see nothing new in their lists.
