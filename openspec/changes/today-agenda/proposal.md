# Today shows the day's calendar events

## Why

Getting an overall look at the day takes several steps: Today lists the tasks, and the appointments from other calendars are only in Day and Week. A user asked for the appointments on Today, where they plan the day anyway. Calendar feeds already bring those events to every device and cache them for offline use, so Today can show them without anything new on the server.

## What Changes

- Today's day-page menu (the header's More actions menu, beside Show or Hide briefing) offers **Show calendar events**, and once on, **Hide calendar events**. It is off by default. It appears only while the device knows at least one subscribed calendar, the same condition under which Day and Week offer their **Calendars** toggle.
- The choice is a synced preference of the account, a new additive `user_prefs.today_events` field ("shown" or "hidden"; empty or unknown reads as hidden), so it follows the user to every device and works offline.
- With the option on and events today, Today shows a compact read-only agenda before its list: today's all-day events as chips, then the timed events in start order with their time range, title, calendar dot and location. Free events use the calendar's dashed outline; timed events that already ended are dimmed. A click or Enter opens the same details popover as Day and Week. Nothing is shown on a day without events.
- The agenda reads the device's cached events, refreshed like a calendar view while the option is on or a subscription is known. Offline or stale, it carries the calendar toolbar's "Calendars as of <time>" line. Adding a first calendar in Settings now fills the device cache for today, so the option appears without opening the calendar first.
- The option is independent of the per-device **Calendars** toggle of Day and Week; events of disabled subscriptions never show.
- `task-list-presentation` "Nothing between the header and the list" allows this opt-in agenda before Today's first task.

Not **BREAKING**: one additive op field, no new route, no new environment variable, no server change.

Out of scope: events in Upcoming, the Plan's capacity counting on Today, editing or creating events, a Settings switch for the option, and clearing the event cache when the owner turns calendar feeds off (the cache already outlives the feature in Day and Week; a separate change can drop it).

ROADMAP: extends item 8, "Calendar feeds, both ways" (`calendar-feeds`).

## Capabilities

### New Capabilities

- `today-agenda`: the Today option and the agenda block it shows.

### Modified Capabilities

- `task-list-presentation`: "Nothing between the header and the list" names the Today agenda as the one opt-in block allowed before Today's first task.

## Impact

- `internal/sync/ops.go` (`user_prefs.today_events`), `internal/sync/testdata/schema_fixture.json`.
- `web/src/lib/types.ts`, `web/src/lib/ops.ts` (defaults), `web/src/lib/userPrefs.ts` (read and set).
- `web/src/app/calendar/TodayAgenda.tsx` (new), `web/src/app/calendar/useNowMinutes.ts` (moved out of `CalendarView.tsx`), `web/src/app/CalendarEvents.tsx` (shared details), `web/src/app/TaskListView.tsx` (menu item and block), `web/src/index.css` (the dimmed event), `web/src/lib/calendarFeeds.ts` and `web/src/app/CalendarFeedsPanel.tsx` (`refreshAfterChange`).
- Tests `web/src/app/todayAgenda.test.tsx`; story `web/src/app/calendar/todayAgenda.stories.tsx` and its baselines.
- Strings in the six catalogs.
- Docs: a new guide page `docs/calendar-events-in-today.md` with a screenshot (`scripts/docs-screenshots.mjs` shot `today-agenda`), links from `docs/today-and-upcoming.md`, `docs/other-calendars.md` and `docs/README.md`; CHANGELOG.
