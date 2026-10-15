# Calendar feeds, both ways

## Why

The Day and Week grids show only OpenTodo tasks (`web/src/lib/calendar.ts:98-110`, `calendarTasks` and `blockFor`), so a slot that looks free may hold a meeting that lives in Google Calendar, Outlook or a shared family calendar, and the "does my day fit" promise of `time-blocking` is only half true. In the other direction, the only way to see tasks in a calendar app is CalDAV (`docs/caldav.md`), which Google Calendar, Outlook on the web and most work calendars cannot subscribe to; they subscribe to an iCalendar URL. Todoist and TickTick both offer calendar subscription URLs, and the comparison pages concede the gap.

## What Changes

- **Subscribe to other calendars.** A user adds up to 10 iCalendar URLs (`https://`, `http://` or `webcal://`) in Settings → Integrations → Calendar feeds, with a name and colour. The server fetches each on a schedule (every 15 minutes, conditional requests, backoff on failure), expands recurring events into a window from 30 days back to a year ahead, stores the occurrences, and serves them to the user's devices through an authenticated route. Fetching follows the outbound policy of webhooks: `http`/`https` only, private and link-local addresses refused unless the owner allowed private network targets, the connection made to the checked address, no proxy, a 20-second timeout and a 2 MB body cap.
- **Events in the grid, read-only.** Day and Week draw the events as blocks in their own colour next to task blocks, side by side when they overlap, with all-day events in a strip above the day. Events cannot be moved, resized or completed, do not count toward the day's planned total, and can be hidden per device from the calendar toolbar. Devices cache the events for offline display and show how old the cache is.
- **Your tasks as a calendar.** Each user can create one private feed URL (`/feeds/<secret>/tasks.ics`) that serves their open, dated tasks as `VEVENT`s, with the estimate as the event length and the recurrence as `RRULE`. The secret is shown once, stored hashed, rotated or revoked from Settings, rate limited, and never a session, API token or app password. Google Calendar, Outlook and Apple Calendar subscribe to it with "From URL".
- **Owner switch.** Both halves are off until the owner turns on **Settings → Integrations → Calendar feeds** (`PUT /api/v1/settings/calendar-feeds`), optionally preset by `OPENTODO_CALENDAR_FEEDS=true` on first start, following the CalDAV precedent. While off, the routes answer 404 and the worker fetches nothing.
- **Encrypted accounts.** Subscriptions work unchanged (the events are not OpenTodo content). The task feed serves every event with the summary "Encrypted item" and no description, because the server cannot read titles; the panel says so.
- **Demo and audit.** Every calendar feed route is refused on a demo instance (the server makes no outbound request there). Creating, rotating and revoking the feed URL are audit events; the secret and subscription URLs are never recorded.

Out of scope:
- Writing to external calendars, free/busy lookups, inviting attendees, and showing external events anywhere but Day and Week (Today, Upcoming and the coming month view stay task-only; `month-and-timeline-views` can reuse the events route and cache).
- More than one feed per user, per-project feeds, and feeds that include completed tasks, deadlines (`deadlines`) or reminders as alarms. These are additive later.
- Counting meetings toward the day's capacity, and dragging a task onto an event to "schedule around it".
- CalDAV changes. CalDAV keeps the two-way sync for clients that speak it.
- Importing external events as tasks.

ROADMAP: advances "Next: Parity and depth" row 8, **Calendar feeds, both ways** (`calendar-feeds`). Refinements of the row's notes, recorded here: one owner switch covers both halves (not only the inbound URLs); the task feed emits `VEVENT`, not `VTODO`; redirects are followed up to three times with every hop re-checked, unlike webhook deliveries.

Nothing here is **BREAKING**. No op-log change: subscriptions, cached events and feed secrets are server data outside the op log, like webhooks and app passwords. `OPENTODO_CALENDAR_FEEDS` is optional. No new dependency.

## Capabilities

### New Capabilities
- `calendar-feeds`: iCalendar exchange between OpenTodo and other calendars over HTTP: subscriptions to external calendar URLs fetched by the server and shown read-only in the Day and Week grids, and the per-user read-only task feed URL, with the owner switch, limits and encryption behaviour that both share. One capability rather than `external-calendars` plus `task-feed`: both are governed by the same owner switch, live in the same Settings panel, reuse one iCalendar module and the same outbound and demo policy, and each half alone would be four requirements with the shared ones duplicated.

### Modified Capabilities
- `time-blocking`: the overlap layout includes event blocks, which carry the marker but never count toward the planned total.
- `webhooks`: the owner's "allow private network targets" setting also governs calendar subscription URLs.
- `demo-mode`: calendar feed routes are refused on a demo instance.
- `audit-log`: feed URL creation, rotation and revocation are recorded.
- `end-to-end-encryption`: the task feed degrades to placeholder titles; subscriptions are unaffected but their events are stored in plaintext on the server.

Not modified, on purpose: `http-api` (routes are specified in `calendar-feeds`, as `webhooks` and `caldav-sync` did; the feed route lives outside `/api/v1` like `/dav/`), `self-hosting` (the "No telemetry" requirement already covers user-configured destinations, and `OPENTODO_CALENDAR_FEEDS` is specified in `calendar-feeds` like `OPENTODO_CALDAV` in `caldav-sync`), `settings-navigation` (the Integrations section gains a panel; its requirements still hold), `caldav-sync` (unchanged; `docs/caldav.md` only gains a pointer).

## Impact

- **Server:**
  - `internal/outbound` (new): the SSRF guard moved out of `internal/webhook/ssrf.go` (`ValidateURL`, `IsDenied`, `Dialer`, `NewClient` with a timeout parameter); `internal/webhook` keeps thin aliases so its tests and callers do not change.
  - `internal/calfeed` (new): iCalendar `VEVENT` parsing on top of `internal/caldav`'s tokenizer (`Parse`, `Unfold`, `ParseLine` in `internal/caldav/ical.go`) with a higher property limit, recurrence expansion with `EXDATE`, `RDATE` and `RECURRENCE-ID` overrides, time zone resolution (`internal/zoned` plus a Windows-to-IANA table), the fetcher and its schedule, the occurrence store, and the task feed writer (`VEVENT` from `sync.List` rows, `RRULE` from `internal/recurrence`).
  - `internal/httpapi/calfeed.go`: routes under `/api/v1/calendar-feeds`, `/feeds/{token}/tasks.ics`, `GET`/`PUT /api/v1/settings/calendar-feeds`, demo deny-list entries in `demo.go`, a `calendar` event on the live channel (`events.go`, `internal/sync/notifier.go`).
  - `internal/audit/events.go`: `calendar_feed.created`, `calendar_feed.rotated`, `calendar_feed.revoked`.
  - `internal/config`: optional `OPENTODO_CALENDAR_FEEDS`. `cmd/opentodo/main.go`: the fetcher runs under the jobs leader like the webhook worker (`main.go:197-226`).
  - Migration (the next free number): `calendar_subscriptions`, `calendar_events`, `calendar_feed_tokens`.
- **Web:** `web/src/lib/calendar.ts` (event blocks, all-day strip rows), `web/src/lib/layout.ts` (unchanged API, mixed inputs), `web/src/app/CalendarView.tsx` (event blocks, all-day strip, toolbar toggle, cache status), `web/src/lib/calendarFeeds.ts` (cache refresh, window logic), `web/src/lib/db.ts` (the next free Dexie version: `calendarEvents`, `calendarSubscriptions`), `web/src/lib/api.ts` and `types.ts`, a `CalendarFeedsPanel` in Settings → Integrations (`SettingsView.tsx:215-223`), `web/src/lib/sync.ts` (listen for the `calendar` live event), audit labels.
- **API:** nine routes under `/api/v1/calendar-feeds`, one feed route, one settings route; error codes `private_target`, `limit_reached`, `rate_limited`, `feeds_disabled`, `fetch_failed`.
- **Docs:** new `docs/calendar-feeds.md`; `docs/time-blocking.md`, `docs/api.md`, `docs/settings.md`, `docs/webhooks.md` (the toggle's wider scope), `docs/e2ee.md` (two table rows), `docs/caldav.md` (pointer), `docs/self-hosting/coolify.md` (variable table), `docs/self-hosting/demo.md`.
- **Size:** no dependency. About 1,800 lines of Go (half of it the parser, expander and their tests) and 1,000 of TSX. The binary grows by roughly 300 kB, the main JS bundle by about 20 kB minified (6 kB gzip). Runtime memory is unchanged when idle; a fetch holds at most 2 MB of body plus its parsed form for its duration, and at most two fetches run at once.
