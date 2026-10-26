# Proposal

## Why

People ask for real two-way sync with the calendar they already live in: "move the event in my calendar and the task moves, and the reverse". OpenTodo has three calendar pieces today, and none of them gives that for Google Calendar, iCloud or Fastmail users:

- the CalDAV server (`caldav-sync`) syncs tasks as VTODO, which Google Calendar and Outlook never show, and which Apple Calendar shows only as Reminders;
- calendar subscriptions (`calendar-feeds`) read other calendars into Day and Week, read-only;
- the task feed (`calendar-feeds`) shows tasks as events in a calendar app, read-only and refreshed whenever the app feels like it (hours, for Google).

This change makes the server a CalDAV **client**: a user connects their own calendar account, OpenTodo writes their dated tasks into one calendar of it as ordinary events, and reads back what the user changed there. Every CalDAV server with a username and an app password works (iCloud, Fastmail, Nextcloud, Synology, Radicale, Baïkal, mailbox.org, …), and Google Calendar works through its CalDAV endpoint with OAuth 2.0.

## What Changes

- **An owner switch** `calendar_sync.enabled`, off by default like the other integrations: while off, every `/api/v1/calendar-sync` route answers 404 and nothing is contacted. Every signed-in user reads it; only the owner changes it; the change is audited. The owner can also store a Google OAuth client (client id in settings, client secret in `<data>/secrets/calendar-sync.json`) or set it with the optional `OPENTODO_GOOGLE_CLIENT_ID` and `OPENTODO_GOOGLE_CLIENT_SECRET` (or `OPENTODO_GOOGLE_CLIENT_SECRET_FILE`); without one, only CalDAV accounts can be connected.
- **Calendar connections**, per user, at most 3, under Settings → Integrations → Calendar sync:
  - a **CalDAV** connection from a server address (or an email address or host name, found through `/.well-known/caldav`), a username and an app password; the server discovers the principal, the calendar home and the calendars that hold events;
  - a **Google** connection made with a **Connect Google** button: an OAuth 2.0 authorization-code flow with PKCE and a state bound to the session, scope `https://www.googleapis.com/auth/calendar`, Google's CalDAV endpoint `https://apidata.googleusercontent.com/caldav/v2/`;
  - the user picks **one calendar to write tasks into** and optionally **other calendars of the same account to show** in Day and Week; an option **Include tasks without a time** (off by default) adds all-day events for date-only tasks.
  - App passwords and refresh tokens are stored in the server's secrets directory, never in the database, a backup's database, the API or a log.
- **Push (OpenTodo → calendar)**: the same tasks as the task feed (open, with a due date from 30 days back to a year ahead, own and shared, outside archived projects) become events named `<task-id>.ics`, with the task id as UID: a timed task becomes an event of its estimate (30 minutes without one) in its own zone or floating; a date-only task becomes an all-day event only with the option on. Writes are conditional (`If-None-Match: *` to create, `If-Match` with the stored ETag to change or delete), completed, deleted, undated and out-of-window tasks are removed, and recurring tasks are written as their next occurrence only.
- **Pull (calendar → OpenTodo)**: on the jobs leader every 5 minutes, and about 20 seconds after the user's own task changes, the server asks the target calendar what changed (`sync-collection` with a sync token where the server supports it, else an ETag listing), and for the events it wrote: a new start, end or all-day state becomes the task's new due (and the event's length its estimate), a new title becomes the task's title, and a deleted event leaves the task without a date; the task is never deleted. Every write is an op through `ApplyStrict` with device `calsync:<connection-id>` and wakes the user's devices. Events OpenTodo did not create are only shown, read-only, like subscribed calendars. Each cycle pulls before it pushes; when the task and the event both changed the same thing since the last sync, the newer change wins.
- **Events of connected calendars in Day and Week**: the chosen calendars' events (and the target calendar's own events, without the ones OpenTodo wrote) are stored and served exactly like calendar subscription events, so the calendar views change only to accept them.
- **End-to-end encryption**: an encrypted account's tasks are written with the neutral title "Encrypted item" and no notes, and title changes made in the calendar are never applied; dates still sync both ways.
- **Errors**: each connection shows its last sync, its last error and what the last cycle did; failures back off from 5 minutes to 6 hours; a refused password or a revoked Google grant pauses the connection in a **Reconnect** state; a vanished target calendar pauses it until another one is chosen.
- **Demo**: every `/api/v1/calendar-sync` route and the settings routes are refused before authentication; the panel shows the demo note.
- **Audit**: `calendar_connection.created`, `calendar_connection.updated` (the setting's name only) and `calendar_connection.deleted`, plus `settings.changed` for the owner switch and the Google client. Addresses, usernames, passwords, tokens and event content never reach the log.
- No new dependency (stdlib HTTP, XML and the existing iCalendar code), no change to the op log schema, no mandatory environment variable. Not **BREAKING**.

Out of scope:

- **Microsoft Outlook and Microsoft 365**: Exchange Online has no CalDAV; it needs Microsoft Graph and will be its own change on the same connection model. Outlook users keep the task feed and calendar subscriptions.
- **VTODO sync to external servers** (OpenTodo stays the CalDAV server for to-do apps).
- Meeting invitations, attendees, alarms written into the external calendar, and recurring events written as series.
- Removing the events OpenTodo wrote when a connection is deleted (they stay as ordinary events).

Advances ROADMAP.md: "Integrations and data ownership" (row 8, "Calendar feeds, both ways", which shipped read-only feeds and named two-way sync with the calendar people use as the gap), with the new row `calendar-two-way`.

## Capabilities

### New Capabilities

- `calendar-sync`: the owner switch and Google client, per-user connections and discovery, credentials, the push and pull rules, conflicts, the schedule and backoff, the events shown in Day and Week, limits, the management API and the Settings panel.

### Modified Capabilities

- `calendar-feeds`: events of connected calendars are served and drawn like subscription events, also while calendar feeds are off (ADDED requirement).
- `demo-mode`: calendar sync is refused on the demo before authentication (ADDED requirement).
- `audit-log`: calendar connection events and what they may carry (ADDED requirement).
- `end-to-end-encryption`: what calendar sync writes and reads for an encrypted account (ADDED requirement).
- `multi-tenant-host`: calendar sync cycles run on the shared scheduler for tenants with a cycle due (ADDED requirement).

## Impact

- Server: new package `internal/calsync` (store, secrets, a WebDAV/CalDAV client on `internal/outbound`, discovery, the Google OAuth client, the event mapping, the sync cycle and the worker) with the in-process test server `internal/calsync/calsynctest`; migration `0047_calendar_sync.sql` (`calsync_connections`, `calsync_links`, `calsync_oauth`, and `calsync_calendars`, which marks the calendar subscriptions that hold a connected calendar's events, so they reuse the subscription event store); `internal/calfeed` gains a one-event writer and LAST-MODIFIED parsing; routes in `internal/httpapi/calsync*.go` through `routes.handle` with `.demoDenied()` and matching deny-list entries; a shared owner switch helper in `internal/httpapi/switch.go`; the reserved device prefix `calsync:` in `internal/sync/devices.go`; audit constructors; config `OPENTODO_GOOGLE_*`; wiring in `internal/tenant` (jobs and the post-commit observer) and `internal/host/scheduler.go`.
- Web: `web/src/app/CalendarSyncPanel.tsx` under Settings → Integrations → Calendar sync, API methods and types, the history label for `calsync:` writes, tests, strings in the six catalogs.
- Docs: new `docs/calendar-sync.md`; links from `docs/calendar-feeds.md`, `docs/other-calendars.md` and `docs/caldav.md`; `docs/api.md`, `ROADMAP.md`, `CHANGELOG.md`, `AGENTS.md`.
- Size: about 250 KB more server binary (stdlib only), about 6 KB gzipped for the panel; runtime memory unchanged while no connection exists, otherwise one HTTP client and one calendar's listing per cycle in flight (at most 2).
- Outbound traffic: only to calendar servers a user typed (checked by the outbound policy, never private targets unless the owner allows them) and to Google's OAuth and CalDAV endpoints when the owner configured a Google client and a user connected Google; only while the owner switch is on; never on the demo.
