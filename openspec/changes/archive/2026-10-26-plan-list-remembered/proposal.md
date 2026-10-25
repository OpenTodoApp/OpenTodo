# The Calendar remembers whether the planning list is open

## Why

The planning list closes whenever the user leaves the Calendar, and returning means opening it again from the menu every time (GitHub issue 384). People who plan from a list do it on most visits.

## What Changes

- Whether the planning list is open is remembered on the device. Opening it remembers it open; its close button, Escape or the menu's "Hide the planning list" remember it closed.
- From 1024 px, arriving on Day, Week, Month or Plan opens it again when it was left open and nothing else is in the panel slot. A task opened from the Calendar, or leaving the Calendar, does not change what is remembered.
- Phones are unchanged: there the list is a sheet over the calendar, so it never opens by itself.

Not **BREAKING**: no op, API or server change; one local storage key.

## Impact

- `web/src/app/calendar/PlanPanel.tsx` (the remembered state and `usePlanPanel`), `web/src/app/PanelFrame.tsx` (an `onClose` for Close and Escape), `CalendarView.tsx`, `MonthView.tsx`, `PlanView.tsx`.
- Tests `web/src/app/calendarPlanPanel.test.tsx`.
- `docs/` calendar page, CHANGELOG.
