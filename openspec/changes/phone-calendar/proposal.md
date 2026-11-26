# Proposal

## Why

Since 1.9.0 a phone shows the phone screens by default, and every task list and the task page were written for one. The owner asked on 2026-11-26 whether the whole app had been rewritten for the phone: it had not. The screens with content of their own were left under the phone header as they were, each "a later change" (`phone-all-screens`, design). The calendar is the first of them.

Reading the calendar's code showed it is not a desktop screen squeezed: below 640 px Week is already a list of days (`WeekAgenda`), Month a grid with the chosen day's list under it (`MonthDayList`), Plan an agenda (`PlanAgenda`), and Day a time grid with holds for touch. What is out of step with the rest of the phone UI is narrower, and concrete:

- A task in those three lists is a row of its own kind: a tap selects it and a second tap opens it, there is no check, no swipe. In every phone list a tap opens the task page and the circle completes.
- In the Day grid the zone that resizes a block is 7 px tall at its top and bottom: a finger cannot hit it.
- No test of the phone UI opens a calendar screen.

## What Changes

- **A task in a calendar list is the phone row.** In Week's list of days, Month's list of the chosen day and Plan's agenda, with the phone screens on below 768 px: the day's tasks are one card; the circle completes with Undo; a tap opens the task page; a swipe right completes and a swipe left opens the date sheet, as in the task lists. The row keeps what a calendar row says: its time or "all day" first, a span's "Day 2 of 3", the deadline mark, the estimate.
- **Moving a task to another day from Week** is the date sheet, opened by the swipe, since the list has no grid to drag over.
- **Resizing by touch.** A press by touch within 24 px of a block's top or bottom resizes it (7 px for a mouse, as before), never more than a third of the block, without drawing the block differently.
- **Tests and checks:** behaviour tests for the three lists in the phone UI, the gestures' end-to-end script opens Week and Month, the layout check keeps covering the calendar screens.

Out of scope, each a later change if wanted: tap to place from the planning list in Week on a phone (it is off there by a decision of `plan-list-tap-to-place`, whose placement is a time on a grid: placing on a day of a list changes that capability and is not done here); redrawing the Day time grid or giving Week a scrolling grid; Quarter and Year (a month is already one button there); a project's Timeline and Board; the event editor and the Calendars menu, which are sheets and menus already; every width from 768 px; any new function of the calendar. The other screens with content of their own (Notes, Settings, a project's Board, Routines, Statistics, Updates, the Inbox's Process) follow as changes of their own, each after reading what the screen already does below 640 px.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `phone-ui`: gains the calendar's lists and touch sizes. Its earlier requirements are in `phone-ui-trial`, `phone-lists`, `phone-all-screens` and `phone-ui-default`, not archived yet, so this change only adds requirements.

`time-blocking`, `month-view`, `planner-view` and `multi-day-tasks` describe what the calendar does on narrow screens; none changes: what a row says and what a day lists stay as they specify.

## Impact

- Changed: `web/src/app/task-list/rowDraw.ts` (`CalendarRowDrawContext`), `web/src/app/calendar/WeekAgenda.tsx`, `MonthRow.tsx`, `PlanRow.tsx` and `web/src/app/MonthView.tsx` (they call it when it is set), `web/src/phone/PhoneChrome.tsx` (provides it), `web/src/app/calendar/grid.ts`, `DayColumn.tsx`, `SlotBlock.tsx` and `EventBlock.tsx` (the resize zone of a touch).
- New: `web/src/phone/screens/PhoneCalendarRow.tsx`, `web/src/phone/phoneCalendar.test.tsx`, stories for the three lists in the phone UI with their baselines; `scripts/e2e-phone.mjs` gains Week and Month.
- No op field, no route, no server change, no environment variable, no dependency. The first load is measured against `web/bundle-budget.json`.
