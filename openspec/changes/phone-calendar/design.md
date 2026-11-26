# Design

## Context

`phone-all-screens` gave every screen the phone header and every `TaskRow` in its full shape the phone row, through `TaskRowDrawContext` (`web/src/app/task-list/rowDraw.ts`). The calendar's lists do not use that shape: `WeekAgenda` and `MonthRow` each draw a task as their own button, and `PlanRow` uses `TaskRow`'s compact shape, which is never handed to the phone UI. So three lists that a phone shows every day kept rows where a tap selects and a second tap opens.

What exists below 640 px was read before writing this (the proposal lists it). The plan is to change the row, not the screens.

## Goals / Non-Goals

**Goals:** the phone row in the calendar's three lists with what a phone list does (open, complete, swipe, hold); a resize a finger can start; tap to place in Week; tests that open the calendar in the phone UI.

**Non-goals:** a new Day or Week grid, Quarter, Year, Timeline, Board, the event editor, anything from 768 px, any change to what a day lists.

## Decisions

**D1. One row for the three lists first, then the phone draws it.** `WeekAgenda`'s and `MonthRow`'s task rows move to `TaskRow shape="compact"`, which `PlanRow` already uses, with the props that shape has (date, time, position, hue, large, selected, readOnly). That step changes no behaviour and is checked by the existing tests (`calendarView`, `monthView`, `planView`, `calendarSpans`, `calendarDeadlines`) and the visual baselines of `Screens/Calendar` and `Screens/Month`; where a baseline moves by a pixel it is looked at and regenerated. Considered: a phone row written three times, once per list. Rejected for the reason `phone-lists` gave: copies drift.

**D2. The compact shape is drawn by the phone UI only inside a calendar list.** `TaskRow` hands the compact shape to `TaskRowDrawContext` when the list marks itself (`CalendarListContext`, provided by `WeekAgenda`, `MonthDayList` and `PlanAgenda`), not everywhere: the compact shape is also used where a phone row would be wrong (a board's card stays as it is; `phone-all-screens` D3). `PhoneTaskRow` draws it from the compact props: the time or "all day" as the leading fact, then the facts `rowModel.factsOf` gives, the span's place and the estimate at the end. No new fact, so the interface budget (`docs/interface-guide.md`: at most 7 properties in a row, 2 rows of chrome above a list's first item) is unchanged: a calendar row shows time, title, deadline mark, span place, estimate.

**D3. Completion, swipe and hold are the task lists' own.** The circle calls `completeWithUndo`; the swipe is `useRowSwipe` with `TaskDateSheet` (`phone-lists`); the hold is `holdForRow` opening the row menu the calendar already has (`occurrenceMenu` for a projected occurrence stays as it is: a projection is not a task row). The three lists get the actions through one small hook, `useCalendarRowActions(today)`, so they do not each wire them.

**D4. A day's rows are one card by the mark the lists use.** `data-phone-rows` on the day's `<ul>` (`web/src/index.css`, no `:has()`: the scale test forbids it). Events, slots, frame headings and deadline markers sit in the same card as rows of their own kind, as they are today.

**D5. The resize zone grows on a coarse pointer only.** `RESIZE_ZONE_PX` (7) stays for a fine pointer. With `(pointer: coarse)` the hit test in `DayColumn` uses a 24 px zone, centred on each edge and so reaching 12 px outside a block. A block shorter than 48 px keeps its middle for moving: the zones are then entirely outside it. The drag already distinguishes a long press (350 ms) from a scroll; that stays. 24 px is WCAG 2.2's target size and is what fits between two quarter-hours at `PX_PER_MIN = 0.8` (12 px each); 44 px would cover three quarter-hours and steal moves from the neighbours.

**D6. Tap to place in Week targets a day.** `useTapPlace` is on when `mode === 'day' || wide`; it becomes on in Week below 640 px too, where the target is a day's section (`data-agenda-day`) instead of a time. The drop it writes is `commit`'s for a day without a time.

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
