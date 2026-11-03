# Proposal

## Why

The shell loads the Calendar, Settings and Import screens before the Inbox is drawn, although none of them is on the start screen. On a phone the first visit pays for the settings panels, the calendar, their dialogs and their shared chunks; the web first load measured 745.3 KB gzip (entry 312.4 KB) before this change. The Calendar's project layout keeps `CalendarView` in that same first-load graph even though a project only draws it when its layout is Calendar.

The calendar event cache also asks `GET /api/v1/calendar-feeds/events` on sync start, reconnect and Today's agenda whenever the device knows a subscription or the user turned the agenda on. That route answers 404 `feeds_disabled` while the owner has both calendar feeds and calendar sync off, which is the default. A fresh install therefore writes a 404 into the server log for a feature nobody enabled, and keeps retrying it.

## What Changes

- `CalendarView`, `SettingsView` and `ImportScreen` become lazy routes of the shell, each with the shared row skeleton while its chunk loads. A project's Calendar layout (`ProjectCalendar`, which imports `CalendarView`) loads the same way; without that boundary the component would stay in the static graph.
- The existing lazy boundaries for Month, Plan, Year and the other screens are unchanged. Nothing is preloaded on idle: the Inbox, Today, Upcoming and a project's list keep their current immediate first paint.
- The service worker already precaches every hashed JavaScript chunk, so each route still opens offline after the first visit. The change adds no fetch of its own.
- Before asking for events, the client reads the `calendar-feeds` and `calendar-sync` owner switches (plain signed-in reads, off by default). While both are off it asks for no events, resolves the refresh as unsuccessful and empties the device cache and its window; the next call after one switch is on fetches again. When the switches cannot be read (offline, an older server) the state is unknown and the events route is still asked, as before.

Not **BREAKING**: no route, op field, schema or environment variable changes. The server and API are untouched.

**Out of scope**: changing the owner switches, adding a combined settings route, preloading chunks on navigation speculation or on idle, moving Settings' search index out of the first load, and any visual redesign of the screens.

ROADMAP.md: advances the first-load and phone budgets tracked by `performance-10k`; no new product capability.

## Capabilities

### Modified Capabilities

- `app-shell`: screens that are not part of the start path load on first visit, with a loading shape, and stay available offline through the service worker's precache.
- `calendar-feeds`: a device asks for no events while both calendar switches are off, and drops any cached events until one is on again.

## Impact

- **Bundle, measured with `node scripts/bundle-budget.mjs --json` on the same Vite build:** entry 312.4 KB to 135.0 KB gzip; entry plus its static imports 745.3 KB to 648.1 KB. The budgets stay at 323 KB entry and 746 KB first load, leaving headroom rather than raising them. CalendarView is 9.7 KB gzip, SettingsView 79.5 KB, ImportScreen 5.2 KB and the project Calendar layout 1.1 KB, all fetched on demand.
- **Offline:** the built service worker precache grows from 255 to 289 entries and includes the new chunks. Opening a lazy route offline serves its chunk from the precache; no route loses its cached document.
- **Server, data and sync:** none. The switches already exist and are read through the existing API client; no operation, migration or server handler changes.
- **Privacy and network:** two signed-in switch reads replace one 404 while calendars are off. No new destination, no telemetry, no request while offline beyond the existing failure path.
- **Tests:** the shell test opens Week, Settings and Import through the lazy boundaries; the calendar cache tests cover both switches off, one on, and unreadable switches; Today's agenda test asserts that the events route is not called while feeds are off.
