# Edit calendar events in the calendar

## Why

The calendar views show the events of connected calendars next to tasks, and the docs say "Events can't be moved or completed" (`calendar-feeds`, "Events are read-only and can be hidden"). People who connected Google, Outlook or a CalDAV account then plan their day in OpenTodo but fix a meeting's time in another app. A calendar worth planning in lets you drag a meeting 30 minutes later, shorten it, rename it or delete it where you see it, the way Notion Calendar does.

The pieces are there: calendar sync already holds an authenticated connection to the account with write permission (Google `calendar` scope, Microsoft `Calendars.ReadWrite`, a CalDAV app password), the remote calendar tells us which calendars are writable, and the grid already has a drag layer for task blocks. What is missing is a write path for events, with the remote calendar as the source of truth.

## What Changes

- **A per-connection opt-in, "Edit events in OpenTodo", off by default.** `PATCH /api/v1/calendar-sync/connections/{id}` takes `edit_events`. Connections keep behaving exactly as today until it is turned on.
- **Move, resize, rename and delete events** that live in a calendar of an opted-in connection, when the remote calendar allows writes and the event is a plain, single, guest-free event. The server writes through a new `EventWriter` (CalDAV and Google over WebDAV, Microsoft Graph) with ETag preconditions, then refreshes its cached copy and wakes the user's devices.
- **Remote is the truth.** Event edits are not operations: they never enter the op log, the export or a backup. A device applies the edit to its cache at once and queues one command; the server answers with the event as the calendar now holds it, or with a conflict, in which case the device rolls back, refetches and says so.
- **Calendar capabilities.** Each calendar of a connection reports `caps: {create, update, delete}` from the account's own permissions; the grid only starts a drag the capability allows. `create` is served for the next phase and used by nothing here.
- **Events in the grid become a third block kind** (beside task blocks and slots) reusing the existing drag code, with the same keyboard parity (arrows, Shift+arrows, Delete) and a one-click alternative for every drag (the event popover gets a time editor and Delete).
- **Offline.** Edits made offline wait in a per-event outbox, coalesced, and are sent on reconnect; an edit the calendar no longer accepts is rolled back with a toast.
- **Agents and the CLI.** MCP tools `update_calendar_event` and `delete_calendar_event` (behind the existing write gate) and `ot calendar events` / `ot calendar event edit|delete`.
- **Read-only stays read-only.** ICS subscription events, recurring events (series and occurrences), events with guests, events OpenTodo wrote for tasks (those keep the task behaviour), and calendars the account marks read-only. The UI says why in a tooltip and in the popover.

## Out of scope

- Creating events, drag-to-create, recurring events and "this and following" (a later phase; `create` capability is served only).
- Guests, invitations, RSVP, conferencing links, descriptions, colours and reminders of events.
- Moving an event to another calendar, and editing ICS feed events.
- Month and Year drags (Day, Week and the Plan's rows that already take task drags are the surface; Month and Year keep reading events).
- Making events a synced entity or putting them in the op log.
- New dependencies, new mandatory environment variables, new OAuth scopes.

This advances the roadmap's calendar sync line (`calendar-two-way`, `outlook-calendar-sync` shipped) with a new row, `calendar-event-edits`, to add to `ROADMAP.md` when the change is archived. Nothing is **BREAKING**: additive JSON fields, one idempotent migration of new tables, no environment variable, no op field.

## Capabilities

### New Capabilities
- `calendar-event-edits`: the event write route, capabilities, conflict rule, offline outbox, grid editing, keyboard parity, agent tools and CLI.

### Modified Capabilities
- `calendar-feeds`: events of connected calendars can be edited when the connection allows it (the "read-only" requirement is narrowed to ICS feeds and the locked cases); the events route serves `rev` and `access`.
- `calendar-sync`: the `edit_events` connection option and per-calendar capabilities.

## Impact

- **Server:** `internal/calsync` (new `events.go`, `event_dav.go`, `event_graph.go`, capabilities in `discover.go`, `graph.go`), `internal/calfeed` (`vevent.go` guest flag, `managed.go` and `store.go` remote refs, `EventRow.Rev` and `Access`), `internal/httpapi` (`calsync_events.go`, routes in `calsync.go`, the connection patch and view), `internal/store/migrations/0074_calendar_event_edits.sql`, `internal/agenttools`, `internal/cli`.
- **Web:** `web/src/lib/calendarEventEdits.ts` (new), `calendarFeeds.ts`, `db.ts` (Dexie v33), `api.ts`, `types.ts`; `web/src/app/CalendarEvents.tsx`, `calendarDrag.ts`, `calendar/DayColumn.tsx`, `calendar/useCalendarKeys.ts`, `CalendarSyncDialogs.tsx`.
- **Docs and checks:** `docs/calendar-sync.md`, `docs/calendar-feeds.md`, `docs/calendar-views.md`, `docs/api.md`, `docs/mcp.md`, `docs/cli.md`, `docs/keyboard.md` (generated), `scripts/ux-audit/drag-alternatives.json`, `scripts/ux-audit/screens.json`, `changelog.d/Added/calendar-event-edits.md`.
- **Data:** only new tables (no column added to an existing one), so a downgraded binary ignores them (design D2).
