# Design

## Context

`phone-all-screens` gave every screen the phone header and every `TaskRow` in its full shape the phone row, through `TaskRowDrawContext` (`web/src/app/task-list/rowDraw.ts`). The calendar's lists do not use that shape: `WeekAgenda` and `MonthRow` each draw a task as their own button, and `PlanRow` uses `TaskRow`'s compact shape, which is never handed to the phone UI. So three lists that a phone shows every day kept rows where a tap selects and a second tap opens.

What exists below 640 px was read before writing this (the proposal lists it). The plan is to change the row, not the screens.

## Goals / Non-Goals

**Goals:** the phone row in the calendar's three lists with what a phone list does (open, complete, swipe); a resize a finger can start; tests that open the calendar in the phone UI.

**Non-goals:** a new Day or Week grid, Quarter, Year, Timeline, Board, the event editor, anything from 768 px, any change to what a day lists.

## Decisions

**D1. The lists keep their rows; the phone UI gives one drawing for the three.** A second seam beside `TaskRowDrawContext`: `CalendarRowDrawContext` (`web/src/app/task-list/rowDraw.ts`), whose props are what a calendar list says of a task on a day (the task, the day, the time as the list writes it, a span's place or range, read-only). `WeekAgenda`'s row, `MonthRow` in the chosen day's list and `PlanDayRows` in the agenda call it when it is set, and draw their own row otherwise, so nothing changes with the phone screens off or from 768 px. `PhoneChrome` provides `PhoneCalendarRow`. First planned: moving `WeekAgenda` and `MonthRow` to `TaskRow`'s compact shape and handing that shape over. Rejected while implementing: the three rows differ in small ways the desktop tests and baselines hold (Week's fixed time column and "all day", Month's priority word, Plan's ring), and unifying them would have changed narrow desktop windows for no gain to a phone.

**D2. The phone calendar row is the phone row with the calendar's facts.** `PhoneCalendarRow` draws `PhoneRow` with: the time or "all day" first (in the danger tone on a past day), a span's place, "deadline today", the estimate, the project. At most four are shown (`MAX_ROW_FACTS`), so the interface budget (`docs/interface-guide.md`: at most 7 properties in a row, 2 rows of chrome above a list's first item) is unchanged. Read-only comes from the list when it knows it (Month, Plan) and from the person's role in the task's project otherwise (Week).

**D3. Completion and the swipes are the task lists' own.** The circle calls `completeWithUndo`; the swipe is `useRowSwipe` with `TaskDateSheet` (`phone-lists`). The row has no menu on a hold: the calendar's lists have none for a task today, and a projected occurrence keeps its own (`occurrenceMenu`), since a projection is not a task row.

**D4. A day's rows are one card by the mark the lists use.** `data-phone-rows` on the `<ul>` that holds the day's tasks (`web/src/index.css`, no `:has()`: the scale test forbids it). In Week the events, slots and frame headings of the day are items of that same list, as they are today; in Month and Plan they stay outside the card.

**D5. The resize zone follows the pointer that pressed.** `resizeZone(blockHeight, pointerType)` in `calendar/grid.ts`: 24 px for `touch` (WCAG 2.2's target size), the earlier 7 px otherwise, and never more than a third of the block, used by `DayColumn`, `SlotBlock` and `EventBlock`. The pointer's own type, not a media query: a laptop with a touch screen gets the right zone for each press. The drag already tells a long press (350 ms) from a scroll; that stays. First planned: zones reaching outside a short block. Rejected: a zone outside a block overlaps the block above or below it and the empty slot between, where a hold adds a task; a short block's length is changed from the task page's estimate instead, and the requirement says so.

**D6. Tap to place in Week is not part of this change.** It was in the first draft. `plan-list-tap-to-place` turns it on where "the view shows times" and places on a time of a grid; Week's list on a phone has days, not times. Placing on a day is a change to that capability's decisions and gets a change of its own if wanted.

**D7. Data model, size.** No op field, no route, no server change. No dependency: image size and memory unchanged. The phone row's compact drawing lands in the lazy `PhoneChrome` chunk; the first load is measured with `make bundle-budget` and reported in the pull request.

## Risks / Trade-offs

- **Moving two lists to `TaskRow` compact may shift pixels on the desktop too** (the lists are also what a narrow desktop window shows). → D1's baselines are the check; any visible difference is a finding to fix, not to accept.
- **A swipe on a row inside a horizontally scrolling parent.** Week's list and Month's day list do not scroll sideways (the layout check asserts it); Plan's agenda neither. Checked again by `e2e-phone`.
- **The larger resize zone could start a resize when a person meant to scroll.** → the long press still gates it; the end-to-end script scrolls the Day grid over a block and asserts nothing moved.
- **Happy-dom has no layout:** the resize zone is tested as a pure function of the pointer's offset and the block's height, and by `e2e-phone` in a real browser.

## Migration Plan

One pull request. No data migration. Reverting is reverting the commit; the switch **New phone screens** off shows the rows as before.

## Open Questions

- Whether the owner wants Week on a phone as a scrolling grid instead of the list. This change keeps the list `time-blocking` specifies; a grid would be a change to that capability.
