# Design

## Chunk boundaries

The shell already lazy-loads every screen that is not part of the first list: Help, Focus, Notes, Review, Routines, the method views and the start guide. Calendar, Settings and Import were the remaining static screens. Each now has one `lazy()` boundary in `web/src/app/Shell.tsx`, so Rollup gives it a chunk and the shell keeps a single `Suspense` fallback per route.

`CalendarView` had a second static path: `TaskListView` imported `listExtras`, which imported `ProjectCalendar`, which imported `CalendarView`. Making only the shell's route lazy left `CalendarView` in the entry chunk, because Rollup keeps a module static when any static importer needs it. The project Calendar layout is now lazy too, which both removes `CalendarView` from the entry and matches the file's existing intent ("Loaded only when a project shows this layout").

Month, Plan and Year were already lazy and are untouched. Settings still imports `useGridPrefs` through `CalendarSettings`; because both sides are lazy, Rollup may put shared calendar helpers in a chunk fetched by either route. That shared chunk is still outside the first load.

The fallback is `Skeleton` with four list rows, the same shape the list screens use while local data loads. It is announced once as a status and is not a spinner. No screen is preloaded on idle: the measured start path matters more than hiding a one-time chunk fetch, and the chunks are local files served from the origin (or the precache), not network round trips to a third party.

## Offline behaviour

`vite-plugin-pwa` precaches `**/*.js` with the build's hashes (`web/vite.config.ts`). The new chunks are therefore in the service worker's precache list; opening Settings, Calendar or Import offline uses the cached chunk and the device's local data. The shell's existing `PanelBoundary` still catches a chunk that disappeared after an upgrade, and the route stays usable.

## Calendar switch check

`refreshEvents` already runs inside one inflight promise, so the check is made once per refresh even when several views ask at the same time. `calendarsOn()` reads `calendarFeedsSwitch` first and only reads `calendarSyncSwitch` when feeds are off. The server's events gate allows the route when either switch is on (`eventsGate` in `internal/httpapi/calfeed.go`), so the two reads mirror the server exactly.

The reads are signed-in reads, not owner-only, so members can make the same decision; a 403 or a network failure falls into the unknown case and the events request is attempted. This keeps an older server, an offline device or a transient settings failure working as before.

When both switches are off the client deletes `calendarEvents`, `calendarSubscriptions` and the window metadata in one Dexie transaction and resolves `false`. Clearing matters because the agenda and the grid draw from the cache: keeping events from a period when the owner allowed calendars would show them after the feature was turned off. With no window stored, the next `refreshEvents` or `ensureEventsFor` call after a switch is turned on has to fetch, so enabling a calendar is picked up immediately rather than after the stale window expires.

The trade is two small settings GETs instead of one 404 while the feature is off. Both are ordinary signed-in reads already used by the Settings panels and their status lines. No new route or combined endpoint is introduced, which keeps this change server-free.

## Data and resource impact

No op field, row, table, route or migration changes. The web bundle shrinks; the server binary is unchanged and no dependency is added. The service worker precache grows by the same chunks (about 14 KB gzip in total) and stores them once, like every other lazy screen.
