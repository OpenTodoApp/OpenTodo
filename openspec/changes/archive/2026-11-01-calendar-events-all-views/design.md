# Design: calendar events in every calendar view

## Context

Day, Week (grid) and Plan draw events from the device cache through `useCalendarFeeds` (`calendar-feeds` D8). The phone's Week agenda, Month and Year did not draw them (GitHub issue #733). The cache holds one window, fetched with one request of at most 92 days.

## Decisions

### D1. One placement of events per day

`eventsByDay(events, from, to, zone)` in `web/src/lib/calendar.ts` places each event once on the days it covers, with the same rules as `allDayEvents` (exclusive end date) and `eventBlocks` (zoned points in the viewer's zone, a part per day across midnight, nothing on the next day for an event ending at 00:00). Month and Year read it instead of testing every event against every day (a year of a busy calendar is thousands of events times 366 days). A test checks it against `allDayEvents` and `eventBlocks` day by day.

### D2. Rows after the tasks

In a Month cell events come after the day's tasks, projected occurrences and deadlines, and take part in "+N more", so the tasks, which are what the Month moves, keep the first rows; all-day events first, then timed ones by start, as in Day's strip and grid. On a phone the grid cell shows a ring (D4) and the focused day's list lists the events last, as 44 px rows. The Week agenda places timed events among the timed tasks at their start (after a task at the same minute) and all-day ones after the spans, like the grid's all-day strip.

### D3. One row component

`EventRow` (Plan's row) gains a variant: `plan` (unchanged), `agenda` (44 px, the agenda's time column, "all day" for all-day events) and `cell` (Month: time and summary, no length). All keep the event shape (sunken fill, hatched edge, calendar dot; dashed outline when free), the hidden location and calendar name, and the read-only details popover. Rows are buttons reachable with Tab; they never take part in j/k, drags or drops.

### D4. A ring for days with events

The Year's day and a phone Month cell mark a day with events with `.ui-event-mark`: a 6 px hollow ring in the muted tone. It differs in shape from the density bar (solid, chart ramp) and the over-capacity dot (filled, danger), and sits at the top start of a Year day, opposite the over-capacity dot, so nothing rests on colour. The density keeps counting tasks only (`year-view` "Events do not count" stands). The mark is `aria-hidden`; the day's accessible name says "N events".

### D5. Wider windows in pieces

`fetchRange` keeps padding a range of up to 92 days by 28 days within 92. A wider range (stacked months, a year) is fetched as asked, capped at 373 days from its start, and `requestRanges` splits it into consecutive requests of at most 92 days. The pieces are fetched one after another; events and subscriptions are merged by id (an event overlapping two pieces comes back twice) and replace the cache in one transaction, as before. A failed piece keeps the old cache. A year is four or five requests, only when the cache does not cover it or is older than 10 minutes. No server change: the server's bound and its occurrence window (30 days back, 365 ahead) stay.

### D6. The toggle and the status in every header

`CalendarsToggle` (split out of Day/Week and Plan) is in Month's and Year's range actions while the user has a calendar, with the same per-device setting; Month and Year show the same freshness line (`CalendarStatus`) after the filter chip. Month now always fetches its weeks' events (it used to only when meetings counted).

## Interface budget

No new row of chrome: the toggle joins the existing header actions, as in Day, Week and Plan, and the status shares the header's meta line. Task properties, sidebar destinations and scroll regions are unchanged; no new shortcut.

## Data model

None. Events stay server data cached per device, never ops.

## Size

No dependency. The Month and Year chunks grow by a few hundred bytes gzip, the main chunk by the toggle and the row variants.
