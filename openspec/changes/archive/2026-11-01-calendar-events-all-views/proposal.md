# Calendar events in every calendar view

## Why

GitHub issue [#733](https://github.com/OpenTodoApp/OpenTodo/issues/733): events of subscribed and connected calendars show in Day and Plan but not in Week, Month or Year. Two causes:

- **Week on a phone (a bug).** Below 640 px the Week is a vertical agenda (`time-blocking` "Planning list and phone agenda"). The grid draws events, but the agenda never received them, so on a phone the Week shows none, against `calendar-feeds` "Events drawn in Day and Week".
- **Month and Year (a gap in the specs).** Month read events only to count meetings in a cell's capacity, and only when the device counts meetings. Year was specified to count tasks only ("Subscribed calendar events ... SHALL not count"). Neither showed the events themselves, so the calendar's overview views left out the user's commitments.

A third limit sat under both: a device cached one window of at most 92 days (the server's bound on one request), too little for stacked months or a year.

## What Changes

- **Week agenda (phone):** each day lists its all-day events after its spans and its timed events among the timed tasks at their start, as read-only rows of the agenda's height (44 px) with the calendar's event shape; a day with only events is not "Nothing planned."
- **Month:** each cell lists the day's events after its tasks, projected occurrences and deadlines, all-day ones first, then timed ones by start, in the event shape; they take part in "+N more" so tasks keep the first rows. A cell's accessible name counts the events apart from the tasks. On a phone a day with events shows a small ring under its count and the focused day's list under the grid lists them. The header gets the Calendars toggle and the calendars' freshness, as Day and Week. Events are fetched for the shown weeks always, no longer only when meetings count.
- **Year:** a day with events shows a small hollow ring of its own, never part of the density; its accessible name and its tip add "N events"; on a phone each month's name says how many of its days have events. The header gets the Calendars toggle and the freshness.
- **Cache:** a device fetches a window wider than 92 days (stacked months, a year; at most 373 days) as consecutive requests of at most 92 days and stores the union as one window. No server change.
- All of it follows the per-device Calendars toggle and shows only enabled calendars; events stay read-only (the same details popover as in Day, never dragged, selected with j/k, counted in the density or moved).
- The layout check answers the events route with a fixed calendar so Week, Month, Year, Plan and Day are checked with events at 360, 390 and 768 px.

Not **BREAKING**: no op, route or environment variable changes.

## Out of scope

- Events in Upcoming. (A project's Calendar layout uses the same views, so it shows them in Month and Year as it already did in Day and Week.)
- Counting events in the Year's density or in the Month's task count.
- Showing event titles in the Year's tip (it shows the count).

## Roadmap

A fix outside the road-to-1.0 table, from user report #733. Builds on `calendar-feeds`, `month-view`, `year-view`, `planner-view` and `meeting-aware-capacity`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `calendar-feeds`: ADDED "Events in the Week agenda", "Events in the Month", "Events marked in the Year"; MODIFIED "Devices cache events for offline display" (windows wider than one request), "Events are read-only and can be hidden" (the toggle in every calendar view).

## Impact

- **Web:** `web/src/lib/calendarFeeds.ts` (pieces), `web/src/lib/calendar.ts` (`eventsByDay`), `web/src/app/CalendarEvents.tsx` (`EventRow` variants), `web/src/app/calendar/WeekAgenda.tsx`, `MonthWeek.tsx`, `CalendarsToggle.tsx`, `useCalendarFeeds.ts`, `web/src/app/MonthView.tsx`, `YearView.tsx`, `web/src/index.css` (`.ui-event-mark`), one new string in six catalogues.
- **Checks:** `scripts/e2e-layout.mjs`, `scripts/ux-audit/seed.mjs` (the events fixture).
- **Size:** no dependency; a few hundred bytes in the Month and Year lazy chunks and the main chunk.
