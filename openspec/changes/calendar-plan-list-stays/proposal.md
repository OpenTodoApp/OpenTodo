# The planning list stays open across the Calendar

## Why

Issue #350: in the Calendar, after **Plan from a list**, moving to the previous or next day (or week, or month) closed the list. Every Calendar range has its own address (`/day/<date>`, `/week/<date>`, `/month/<date>`, `/plan/<date>`), and the shell closes a panel opened on another page on every route change (`app-shell` "The panel slot has an address", design D1 of ux-overhaul), so each step through the dates counted as leaving the page. Planning a week means moving through it with the list open, so the list has to stay.

## What Changes

- The shell treats the four Calendar ranges, at any date, as one page for the panel slot: the planning list stays open while the user moves through days, weeks or months and switches Day, Week, Month or Plan. Its close button, Escape, or opening anything outside the Calendar close it.
- The open list works with the view on screen: the view registers its drag, place (`s`) and open actions while mounted, instead of the list keeping the actions of the view that opened it.
- Month offers **Plan from a list** too (it had none, so switching to Month left a list that could not place anything): drag a task onto a day, or press `s` to put it on the focused day, keeping a time the task already has.

Not **BREAKING**: no op, API or storage change.

## Impact

- `web/src/app/panel.ts`, `web/src/app/calendar/PlanPanel.tsx`, `CalendarView.tsx`, `PlanView.tsx`, `MonthView.tsx`; test `web/src/app/calendarPlanPanel.test.tsx`.
- `docs/calendar.md`, CHANGELOG.
