# Design

## Context

What the code does today, which the decisions below build on:

- **Connected calendars are cached server-side as expanded occurrences, without addresses.** `internal/calsync/shown.go` `readCalendars` reads each shown calendar (`transport.window`), expands it with `calfeed.ExpandContext` and stores the result with `calfeed.Store.StoreManaged` into `calendar_events` (`0031_calendar_feeds.sql`), keyed `(subscription_id, uid, instance)`. The remote address (CalDAV object href, Graph event id) and ETag are read (`remote.Href`, `remote.ETag`, `internal/calsync/transport.go`) and then dropped. The events route serves `EventRow` (`internal/calfeed/store.go`) whose `id` is `sha256(subscription \x00 uid \x00 instance)[:12]`, computed on the fly.
- **The instance of a single event is its start.** `instanceKey(start)` (`internal/calfeed/vevent.go:296`) is the instance of every non-recurring occurrence, so moving an event changes its `id`.
- **OpenTodo's own events are already excluded** from the shown set (`shown.go`: `r.byHref[...] != nil || o.TaskID != ""`), so every event served as "managed" is one OpenTodo did not write.
- **Credentials and clients exist.** `Worker.transport` (`internal/calsync/worker.go:233`) builds a WebDAV client (`DAV`, used for CalDAV and for Google through its CalDAV API, `GoogleCalDAV` in `calsync.go`) or a `Graph` client (Microsoft). Google is therefore not written with its REST `events.patch`; its scope is `https://www.googleapis.com/auth/calendar` (read and write, `google.go`), Microsoft's is `Calendars.ReadWrite` (`microsoft.go:25`). No new scope or consent is needed.
- **Writes already use preconditions.** `DAV.put` / `DAV.del` (`remote.go`) send `If-Match`; `graphTransport.replace` / `remove` (`graph_transport.go`) send `If-Match` with the `@odata.etag`.
- **Calendars already know if they are read-only.** `Calendar.ReadOnly` (`calsync.go`), from `current-user-privilege-set` for DAV (`discover.go:164`) and `!canEdit` for Graph (`graph.go:219`).
- **A connection is serialised.** `Worker.lock(connID)` guards a cycle; event writes take the same mutex.
- **Devices are woken** by `Notifier.NotifyCalendar(userID)` (`internal/sync/notifier.go:98`, wired as `CalSync.Notify` and `Calendar.Notify` in `internal/tenant/services/wire.go`); the web listens to the `calendar` SSE event (`web/src/lib/sync.ts:657`) and calls `refreshEvents`.
- **The web cache is replaced wholesale.** `refreshEvents` (`web/src/lib/calendarFeeds.ts`) clears `calendarEvents` and `calendarSubscriptions` and bulk-puts the response; Dexie is at version 30 (`web/src/lib/db.ts:471`).
- **Agent writes are change sets of ops**, applied by `Registry.Apply` (`internal/agenttools/apply.go`), except `Plan.exec`, the escape hatch `run_routine` uses for a call that is no change set (`registry.go:176`).

## Goals / Non-Goals

**Goals:** move, resize, rename and delete plain events of opted-in connections from the Day and Week grid, the keyboard, the CLI and agents; remote stays the source of truth; one clear conflict rule; works offline with an outbox; stock OpenTodo stays downgrade-safe.

**Non-Goals:** create events, recurring events, guests, moving an event between calendars, ICS feed events, Month and Year drags, events as synced entities.

## Decisions

### D1. Event edits are not operations

Events live in somebody else's calendar and are cached server-side only (`calendar-feeds`: server data, never in the op log, the export or a backup). An op would invent a second source of truth and make two devices converge on a value the remote may have refused. So:

- `internal/sync/ops.go` `Schema` is untouched, `docs/sync.md` gets no new field, and `internal/writepaths` has nothing to allow-list.
- The device patches its Dexie cache optimistically and queues a **command** in a local outbox (D6). The server executes the command against the remote calendar and answers with the event as the remote now holds it.
- Convergence: every device converges on the remote's state because every device re-reads the cache from the server (`NotifyCalendar`, then `refreshEvents`). Two devices editing the same event offline: the first command to reach the server wins, the second gets `409 event_changed` (D5) and rolls back to the winner's state.

Rejected: an `event_override` op entity (a second truth, orphaned when the remote changes, raises E2EE and export questions); reusing the cycle's task-snapshot comparison for event writes (it compares task snapshots and cannot express "this foreign event changed"). Event writes do go through `internal/calsync` on the server: they take the connection's cycle lock (`Worker.lock(connID)`) and use the cycle's transports and conditional writes (`If-Match`). The browser only sends the command.

### D2. Event identity and the migration (0074)

The client identifies an event by **`(connection id, event id)`**, where the event id is the existing `EventRow.id` (24 hex characters). The server resolves it to the remote address (connection -> calendar URL -> event href or Graph id) through a new table, so the client never sees or sends an href:

```sql
-- 0074_calendar_event_edits.sql (idempotent: IF NOT EXISTS only, no ALTER)
CREATE TABLE IF NOT EXISTS calendar_event_remote (
  subscription_id TEXT NOT NULL REFERENCES calendar_subscriptions(id) ON DELETE CASCADE,
  uid             TEXT NOT NULL,
  instance        TEXT NOT NULL,
  event_id        TEXT NOT NULL,            -- EventRow.id
  href            TEXT NOT NULL,            -- CalDAV object address, or the Graph event id
  etag            TEXT NOT NULL DEFAULT '', -- the version last read or written
  locked          TEXT NOT NULL DEFAULT '', -- '' editable, else recurring | has_guests | not_organizer | no_etag
  PRIMARY KEY (subscription_id, uid, instance)
);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_event_remote_id ON calendar_event_remote(subscription_id, event_id);

-- A row means "Edit events in OpenTodo" is on for the connection.
CREATE TABLE IF NOT EXISTS calsync_event_edit (
  connection_id TEXT PRIMARY KEY REFERENCES calsync_connections(id) ON DELETE CASCADE
);

-- Managed calendars have no remote refs yet: read them once more.
UPDATE calendar_subscriptions SET etag = ''
  WHERE id IN (SELECT subscription_id FROM calsync_calendars);
```

Why side tables and not nullable columns on `calendar_events` and `calsync_connections`: SQLite's `ALTER TABLE ADD COLUMN` cannot be repeated, so each column needs a Go step (`internal/store/audit_chain.go` is the pattern; `0037` explains). Side tables need none, are idempotent as plain SQL, and follow `calsync_scopes` (`0063_sync_scope.sql`): an older binary never reads them, a row without one means "off", and `calendar_events` and `calsync_connections` keep their exact columns, so downgrade-safety is stronger than with columns. This departs from "add nullable cache columns" on purpose and keeps its intent. The closing `UPDATE` makes the next cycle re-read every managed calendar once (`readCalendars` skips a calendar whose version equals `m.Version`, stored in `calendar_subscriptions.etag`), which fills `calendar_event_remote`; until then `access.reason` is `refresh_pending`. Migration number: **0074** (`0073_note_pages.sql` is the last). Downgrade: an older binary ignores both tables, and the reset `etag` costs it one refetch.

`StoreManaged` gains a sibling `StoreManagedRefs` (same transaction, implemented as `Result.Refs`, a `calfeed.EventRemote` per uid that `Store.Success` writes with the occurrences; `StoreManaged` itself leaves a calendar without refs until its next read): `readCalendars` builds `uid -> {href, etag, locked}` from the `remote` objects it already holds (`o.Href`, `o.ETag`, the parsed events) and writes one `calendar_event_remote` row per stored occurrence. `EventRow` carries the join (`Rev`, and `Managed`, `Known`, `Locked` that are never serialised); the events route turns them into `access` with `calsync.AccessOf`, which `Worker.EditEvent` uses for its answer too. The `event_id` is the hash `EventsOf` computes today, moved into one exported helper `calfeed.EventID(subscriptionID, uid, instance)`. Rows of a re-read calendar are replaced together with its events (delete, then insert, as `Success` does for `calendar_events`), so refs never outlive their events.

A move changes the instance, hence the `id` (Context). A successful `PATCH` therefore answers with the new row and `replaces`, the old id; the client swaps rows (D6). Rejected: giving non-recurring managed events an empty instance so ids stay stable (it changes every id on upgrade and diverges from the feeds' keying; the swap is cheap).

`locked` is computed when the event is read:

| Reason | DAV (CalDAV, Google) | Graph |
| --- | --- | --- |
| `recurring` | the master has `RRULE`, `RDATE` or `EXDATE`, or the object holds a `RECURRENCE-ID` override | `type` is not `singleInstance` (`$select` in `graph.go` gains `type`) |
| `has_guests` | the VEVENT has an `ATTENDEE` (new `calfeed.Event.Guests` set in `vevent.go`); editing would make the server send iTIP updates to people | `attendees` is not empty (`$select` gains `attendees`) |
| `not_organizer` | not applicable | `isOrganizer` is false (`$select` gains `isOrganizer`) |
| `no_etag` | the server sent no ETag | no `@odata.etag` |

### D3. Capabilities per calendar and per event

`Calendar` (`calsync.go`) gains `Caps *Caps` (`json:"caps,omitempty"`, `{create, update, delete}`), stored in the connection's existing `calendars` JSON (additive; older binaries ignore it):

- DAV (`discover.go`: `readOnly` becomes `capsOf`): `bind` gives create, `write-content` gives update, `unbind` gives delete; `write` or `all` give all three; no privilege set gives all three unless `ReadOnly`.
- Graph (`graph.go`): `canEdit` gives all three, else none (Graph has no finer flag).
- A calendar saved before this change has no `Caps`; the server derives `{!ReadOnly, !ReadOnly, !ReadOnly}`. `Rediscover` (`run.go:129`) refreshes them.
- A write refused with 403 answers `403 calendar_read_only` and sets that calendar's caps to false until the next discovery (a privilege set can claim more than the server allows; Google's CalDAV answers for read-only calendars are unverified).
- `create` is served for the next phase and used by nothing in this change.

The connection view always serves `calendars[].caps` (derived from `read_only` for a calendar saved before caps existed). The events route serves, per managed event, `access: {update, delete, reason?}`: `update` and `delete` are true only when the connection has `edit_events`, the calendar's cap allows it and `locked` is empty. The reason is the first unmet condition: `edits_off`, `calendar_read_only`, a `locked` reason, then `refresh_pending`; a calendar that allows only one of update and delete serves `calendar_read_only` for the one it forbids. The UI starts a drag only when `access.update` and shows the reason otherwise; the server re-checks everything on the write (the client flags are hints, not the gate).

### D4. REST contract

All routes sit behind the calendar sync switch (404 `calendar_sync_disabled` while off) and are registered in `internal/httpapi/calsync.go` as `mux.handle(pattern, signedIn.DemoDenied(), gate(handler))`, like the other connection writes. Read and agent tokens already get 403 on non-GET calendar sync routes (`docs/api.md`, calendar sync section); the CLI uses a full token. Handlers live in `internal/httpapi/calsync_events.go`.

```
PATCH /api/v1/calendar-sync/connections/{id}
  body gains:  {"edit_events": true}            // off by default
  view gains:  "edit_events": false, and calendars[].caps {create, update, delete}

GET /api/v1/calendar-feeds/events?from=&to=      // request unchanged
  each event gains:  "rev": "a41c9d03e2b7f610",
                     "access": {"update": true, "delete": true}
                     // or {"update": false, "delete": false, "reason": "recurring"}
                     // "access" is absent for ICS feed events
  managed subscriptions[] gain: "connectionId", "calendarUrl", "caps", "editEvents"

PATCH /api/v1/calendar-sync/connections/{id}/events/{eventId}
  body: {
    "rev": "a41c9d03e2b7f610",                   // required: the rev the client saw
    "summary": "Standup",                        // optional, 1 to 500 characters
    "start": {"date": "2026-11-12", "time": "14:00", "tz": "Europe/Berlin"},
    "end":   {"date": "2026-11-12", "time": "14:30", "tz": "Europe/Berlin"},
    "allDay": false                              // optional; start and end go together
  }
  200: {"event": <the event as the events route serves it: new id, rev, access>,
        "replaces": "<old id>"}
  // all-day: start and end are dates, end exclusive; a point without "tz" is floating

DELETE /api/v1/calendar-sync/connections/{id}/events/{eventId}?rev=a41c9d03e2b7f610
  204
```

`{id}` is the connection id, `{eventId}` the `id` of the event row. `rev` is the first 16 hex characters of SHA-256 of the stored ETag (`hash16`, `calsync.go`), so ETags are never exposed. The server finds the event through `calendar_event_remote` joined to the connection's managed subscriptions (`calsync_calendars`), so another user's or another connection's event is `404 not_found`.

Errors (the standard `{error:{code,message}}` envelope):

| Status | Code | When |
| --- | --- | --- |
| 401 | `unauthorized` | no credentials |
| 403 | `demo_restricted` | public demo (policy, before authentication) |
| 403 | `forbidden` | a read or agent token (existing rule) |
| 404 | `calendar_sync_disabled` | the owner's switch is off |
| 404 | `not_found` | the connection or event is not the caller's, or the event is not cached |
| 403 | `event_edits_off` | the connection's `edit_events` is off |
| 403 | `calendar_read_only` | the calendar's cap forbids it, or the remote answered 403 |
| 422 | `event_not_editable` | locked; the message names the reason (`recurring`, `has_guests`, `not_organizer`, `no_etag`) |
| 400 | `invalid_input` | malformed body, `start` without `end`, end not after start, unknown `tz`, empty or over-long `summary`, nothing to change (the field is named) |
| 409 | `event_changed` | `rev` is not the stored one, or the remote answered 412; nothing was written |
| 404 | `event_gone` | the remote answered 404; the cached row is dropped and devices are woken |
| 429 | `rate_limited` | more than 600 event writes an hour per user (a `calsync.event` limiter, like `calsyncLimiter`) |
| 502 | `calendar_unreachable` | the remote failed; the message is the reason code, as `remoteError` does (`unauthorized_remote` for a refused credential) |

A successful write does, in order and under `Worker.lock(connID)` (the cycle's mutex): resolve and check; call the `EventWriter`; in one transaction update `calendar_events` (summary, start, end, all-day), `calendar_event_remote` (new `event_id` and `etag`) and reset the subscription's `etag` to `''` so the next cycle re-reads that calendar; call `Notify(userID)` (`NotifyCalendar`) so other devices refetch; the caller then records the audit event `calendar_event.changed` (a new name in `internal/audit/events.go` with the connection id, provider and action `updated` or `deleted` under the new detail key `event_action`, never a title): the REST handlers do it today, and the agent tools of group 6 do it in their `EventEditor`. The writing device already holds the answer. `Worker.EditEvent` and `DeleteEvent` return an `*EventResult` (the row, `replaces`, provider) or an `*EventError` whose `Code` is one of the codes of the table above (`Reason` names the lock or the remote failure); the handler only maps them onto statuses. A remote 412 and a stale ETag found by the DAV or Graph pre-read are both `event_changed`.

### D5. The `EventWriter` interface and conflict handling

New file `internal/calsync/events.go`; `Worker.EventWriter(ctx, c *Connection) (EventWriter, error)` sits beside `Worker.transport` and returns a `davEvents` over `DAV` (CalDAV and Google) or a `graphEvents` over `Graph` (Microsoft). Google and CalDAV share one implementation because Google is reached through its CalDAV API.

```go
// EventRef names one event on the remote account at the version the caller read.
type EventRef struct {
	Calendar string // the calendar's URL (DAV) or id (Graph), as in Connection.Calendars
	Href     string // CalDAV object address, or the Graph event id
	ETag     string // never empty: every write is conditional
}

// EventEdit is a change; a nil field stays as it is.
type EventEdit struct {
	Summary *string
	When    *EventWhen
}

// EventWhen is a start and end as the event keeps them: a zoned point keeps its
// IANA zone, a point with an empty Zone is floating, an all-day pair holds dates
// (end exclusive).
type EventWhen struct {
	Start, End calfeed.Point
	AllDay     bool
}

// EventState is an event as the remote holds it after a read or a write.
type EventState struct {
	Ref    EventRef
	Event  calfeed.Event
	Locked string // "" or a reason of D2
}

// EventWriter changes events of one connection's calendars. Every write is
// conditional on ref.ETag.
type EventWriter interface {
	// Read returns the event as the remote holds it now.
	Read(ctx context.Context, ref EventRef) (EventState, error)
	// Update applies edit while the event still has ref.ETag; ErrEventChanged
	// when it does not (HTTP 412, or an ETag that differs on the pre-read).
	Update(ctx context.Context, ref EventRef, edit EventEdit) (EventState, error)
	// Delete removes the event while it still has ref.ETag.
	Delete(ctx context.Context, ref EventRef) error
}

// Errors of an EventWriter; the handler maps them onto the codes of D4.
var (
	ErrEventChanged = errors.New("calendar event changed") // 412
	ErrEventGone    = errors.New("calendar event gone")    // 404
	ErrEventLocked  = errors.New("calendar event locked")  // recurring, guests, not organizer
	ErrCalendarRO   = errors.New("calendar is read only")  // 403 on a write
)
```

**DAV** (`internal/calsync/event_dav.go`; a new `DAV.getObject` returns the body and ETag beside `DAV.get`). `Update` reads the resource, compares its ETag with `ref.ETag` (a mismatch is `ErrEventChanged` without writing), parses it with `caldav.Parse` into the component tree and locks it if the master holds `ATTENDEE`, `RRULE`, `RDATE` or `EXDATE`, or the object holds an override. It edits **only** `SUMMARY`, `DTSTART` and `DTEND` (a `DURATION` is replaced by `DTEND`), bumps `SEQUENCE`, sets `DTSTAMP` and `LAST-MODIFIED`, adds a `VTIMEZONE` with `caldav.VTimezone` when a new `TZID` needs one, re-encodes the **whole VCALENDAR** with `Component.Encode` (unknown properties, alarms, `X-` properties and other components survive) and PUTs it with `If-Match: ref.ETag`. A server that answers 2xx without an ETag header is read once more for it. 412 gives `ErrEventChanged`, 404 `ErrEventGone`, 403 `ErrCalendarRO`. `Delete` sends `DELETE` with `If-Match`. `DAV.Do` already keeps credentials on the account's host.

**Graph** (`internal/calsync/event_graph.go`): `PATCH /me/events/{id}` with `If-Match: <@odata.etag>` and only the changed members of `{subject, start, end, isAllDay}` (times with helpers beside `graphTimes` in `graph_events.go`, zones through `zoned.WindowsName`, a zone without a Windows id written as the same instant in UTC, as for tasks); `DELETE` with `If-Match`; `Read` is a `GET` with `$select=id,subject,start,end,isAllDay,showAs,type,isOrganizer,attendees,location`. 412 gives `ErrEventChanged`, 404 `ErrEventGone`, 403 `ErrCalendarRO`. Throttling reuses `Graph.do`'s `Retry-After` handling.

**Conflict rule.** The server never overwrites a version the user did not see: the client's `rev` must equal the stored ETag's hash and the remote must still hold that ETag (`If-Match`). Anything else is `409 event_changed` with nothing written. The client rolls its optimistic patch back, refetches the range and shows "<title> changed in your calendar; your edit was not applied." No merge: the user redoes the edit on the fresh event. This is deliberately not the "newest change wins" rule of task sync (`calendar-sync`, "Conflicts resolve to the newest change"): that rule exists because tasks are ours; here the calendar owns the event.

**Side effects.** Events with guests are locked (D2), so no write sends an invitation update.

### D6. Web data layer

New `web/src/lib/calendarEventEdits.ts` (outside the shared sync/ops import graph, so it may use `api` and `db`). Types in `web/src/lib/types.ts`: `CalendarEvent` gains `rev?: string` and `access?: {update: boolean; delete: boolean; reason?: string}`; `CalendarSubscription` gains `connectionId?`, `calendarUrl?`, `caps?`, `editEvents?`; `CalendarConnection` gains `edit_events?: boolean`; `SyncCalendar` gains `caps?`. `api.ts` gains `updateCalendarEvent(connectionId, eventId, body)` and `deleteCalendarEvent(connectionId, eventId, rev)`, and `CalendarConnectionPatch` gains `edit_events`.

**Dexie version 33** (`web/src/lib/db.ts`, after version 32): `this.version(33).stores({ eventOutbox: 'key, notBefore' })`, with `eventOutbox!: Table<EventCommand, string>` and the table added to the sign-out clear (`db.ts:590`) and `forgetShellData`. `calendarEvents` keeps its schema.

```ts
interface EventCommand {
  key: string                     // `${connectionId}:${eventId}`: one row per event
  connectionId: string
  eventId: string
  rev: string                     // the rev the user saw, kept from the first edit
  base: CalendarEvent             // the row before the first queued edit (rollback, Undo)
  patch: { summary?: string; start?: CalendarWhen; end?: CalendarWhen; allDay?: boolean } | { delete: true }
  next?: EventCommand['patch']    // an edit made while this one is in flight
  notBefore: number               // a delete waits 8 s so the toast's Undo can cancel it
  sending?: boolean
  tries: number
}
```

- `editEvent(ev, patch)`: in one Dexie transaction, merge into the row for the key (later fields win, a delete replaces everything, an edit that returns to `base` removes the row), put the patched copy in `calendarEvents`, and return the inverse patch for the Undo toast. Pending state is read from the outbox with `useLiveQuery`, never stored on the cached row.
- `flushEventEdits()`: runs after every `editEvent`, on `online`, at start and after `refreshEvents`. It takes rows with `notBefore <= now` and sends one at a time. On 200 it replaces the old row by `event` (`replaces` -> `event.id`), deletes the command and sends `next` if any, against the new id and rev. On 409 `event_changed`, 404 `event_gone`, 403 and 422 it deletes the command, restores `base`, calls `refreshEvents()` and shows a toast with the reason. A command that fails while the device is online (a 5xx, a 429, a 502 `calendar_unreachable`, or no answer) is not retried: the row stays with a visible failed state that `flushEventEdits` skips, and the user's Retry sends it again or Discard deletes it and restores `base`. A command made while offline waits, shown as pending, and is sent on `online`. On 400 it drops the command, restores `base` and shows a toast.
- `refreshEvents` (`calendarFeeds.ts`) now re-applies every queued patch over the fetched rows (matched by `eventId`; events whose command is a delete stay hidden), so a refresh in the middle of an offline edit does not undo it.
- Undo: the toast's action calls `editEvent(ev, inverse)`, the inverse computed from `base` for the fields the edit changed. Undo of a delete before it is sent removes the command. After it was sent it cannot be undone (there is no create in this phase): the toast lasts the 8 seconds, then says "Deleted".
- Time handling: a drop gives a wall time in the viewer's zone, the event keeps its own zone, so a helper `eventPointIn(zone, local)` (the inverse of `localDueOf` in `web/src/lib/dates.ts`, added beside it with vectors) converts back. Floating and all-day points stay floating and all-day.

Offline: nothing is asked of the server; `refreshEvents` fails and keeps the cache as today (`calendar-feeds`, "Devices cache events for offline display"). Convergence: D1.

### D7. Grid UI and keyboard

Event blocks are `EventBlockView` in `web/src/app/CalendarEvents.tsx`, laid out by `web/src/app/calendar/DayColumn.tsx` with the task blocks (`day.events`). They become a third block kind:

- **Drag.** `useCalendarDrag` (`web/src/app/calendarDrag.ts`) keys a drag by `taskId`; `StartOptions` and `DragState` get `entity: 'task' | 'event'`, and `onDrop(id, target)` routes events to `editEvent`. A block starts a `move`, and `resize` / `resize-start` on its edges (`RESIZE_ZONE_PX` in `calendar/grid.ts`), only when `access.update`. The block carries `data-drag-id="calendar-event"`. The all-day lane and the hours stay drop targets (an event dropped on the lane becomes all-day, one dropped on the hours becomes timed with its former length); a drop on another day column moves the date; `into-slot` is ignored for events.
- **Selection and keys.** An event with `access.update` joins the selection order used by `j`/`k` in `calendar/useCalendarKeys.ts`; read-only events stay Tab-focusable for reading as today. The handlers `calendar.nudge` (Up/Down, 15 minutes), `calendar.shift-day` (Left/Right, a day), `calendar.estimate` (Shift+Up/Down, the end) and `calendar.estimate-start` (Alt+Shift+Up/Down, the start) accept an event as their target and call `editEvent`; a new `calendar.delete` (`Delete`, `Backspace`) deletes the selected event with the toast; `calendar.unschedule`, `calendar.place`, `calendar.complete` do nothing for events. All are registered in `web/src/lib/shortcuts.ts` (`docs/keyboard.md` is generated from it); the registry's conflict test covers `calendar.delete`.
- **One-click alternative to every drag** (WCAG 2.5.7, `scripts/ux-audit/drag-alternatives.json`): the event popover (today the read-only `EventDetails`) gains, when `access.update`, a title input, date, start and end time inputs and a Save button, and a Delete button when `access.delete`. Locked, it shows the reason ("Repeating events are read-only for now", "This event has guests", "This calendar is read-only", "Editing events is off for this connection" with a link to the connection's settings). The drag map gets `{"id": "calendar-event", "what": "...", "alternatives": [{"file": "web/src/app/CalendarEvents.tsx", "contains": "data-event-edit"}]}`; `web/src/lib/a11y/dragAlternatives.test.ts` checks the source holds that text.
- **Rendering.** A queued edit shows the block dimmed with `aria-busy`; a conflict shows the toast. Locked events show the reason in the existing `Tooltip`.
- **Settings.** `web/src/app/CalendarSyncDialogs.tsx` (the connection card) gets one switch "Edit events in OpenTodo" with the help text "Moving, resizing, renaming or deleting an event in OpenTodo changes it in your calendar", and a note on any calendar the account marks read-only.

**Interface budget** (`docs/interface-guide.md`): no new row of chrome above the grid (0 of 2 used by this change); no new task property; no new sidebar destination; no new scroll region (the popover editor is the existing popover with a few fields); one new switch on the existing connection card; `calendar.delete` is the only new shortcut and is registered conflict-free, the other four are existing ids with a wider target.

### D8. Agents and the CLI

- `internal/agenttools`: write tools `update_calendar_event` (`{connection_id, event_id, rev, summary?, start?, end?, all_day?}`) and `delete_calendar_event`, and a read tool `list_calendar_events` (`{from, to}`: ids, `rev`, `access`, titles marked as untrusted text like other foreign content), in `read_calendar_events.go` and `write_calendar_events.go`. They go through the existing write gate (`Caller.WriteDenial`: the owner's `mcp.writes`, the user's switch, an `agent` token), the per-token limits and the `agent.write` audit. They are **not** change sets: planning validates and returns a `Plan` whose `exec` (the `run_routine` pattern, `registry.go:176`) calls an `EventEditor` interface given to the registry at construction, implemented in `internal/httpapi` over one shared function, `calsync.Worker.EditEvent`, which the REST handlers also call, so checks, locks, audit and notification are identical. Tool errors use the REST codes of D4.
- `internal/cli` (`cmd_calendar_events.go`, registered in `commands.go`): `ot calendar events [--from D] [--to D] [--json]` (a table of ID, DATE, TIME, TITLE, CALENDAR, ACCESS), `ot calendar event edit <id> [--title T] [--start DATE[Thh:mm]] [--end ...] [--all-day]` and `ot calendar event delete <id>`. They call the REST routes, taking the connection from the event's subscription. A `read` token can list; edits need a `full` token. `event_changed` exits 1 and prints the message.

**As built (group 6).**

- The `EventEditor` interface (`internal/agenttools/calendar_events.go`) has four methods, `Events`, `Validate`, `Update` and `Delete`, over plain agenttools types, so the package does not import `calsync` or `calfeed`. It is an `Options.EventEditor` field, implemented by `calendarEventEditor` in `internal/httpapi/agent_calendar_events.go`. `Validate` is the PATCH body rules (`eventPatch.editOf`) so planning refuses a bad argument before the gate's limits are spent; the editor also checks the calendar sync switch (`calendar_sync_disabled`), the 600 an hour limiter and records `calendar_event.changed`, like the routes. `agent.write` is recorded by `Registry.Call` as for every write tool; a write is one item of the per-token daily limit, held through the `exec` path and returned when the write fails.
- `list_calendar_events` takes `from` and `to` (both required, at most 92 days) and lists the events the calendar view shows, including feed events (no `connection_id`, `rev` or `access`); `rev`, `access` and `connection_id` are those of the events route. Titles and locations are in `untrusted_text`.
- The in-app assistant does **not** offer the three tools (`notInApp` in `internal/assistant/loop.go`): the writes are not change sets, so the review screen cannot hold them (the same reason as `run_routine`), and the read tool returns event titles that the assistant disclosure (`consentFields`) does not name, so a provider would receive them unannounced. This narrows the "in-app assistant" half of the spec requirement; offering the read tool there needs a disclosure line first.
- `delete_calendar_event` is an exception in the tool-name test that forbids `delete` in names: it removes an event from the user's own calendar, behind the write gate and the per-connection switch.
- CLI: `ot calendar` alone is `ot calendar events`. `edit` and `delete` find the event by id or unique id prefix within 45 days of today, and take an extra `--on <day>` to look around another day (the events route needs a date range and has no lookup by id). A new `--start` alone keeps the event's length; a date alone keeps the clock time; a timed event keeps its time zone. `event_edits_off` and `calendar_read_only` exit 5 (a switch, a capability); `event_changed`, `event_not_editable`, `event_gone` and `calendar_unreachable` exit 1. A read or agent token is refused locally by the write gate before anything is sent (exit 5); no token is the usual usage error (exit 2) and a rejected one a 401 (exit 3). Completion learned one more level (`calendar event edit|delete`).
- `internal/httpapi/testdata/v1_surface.json` was regenerated with `-update` (additive): it records the new MCP tools, the `ot calendar` commands, and the error codes and routes of groups 1 to 3 that it had not seen yet.

### D9. E2EE

Editing works on encrypted accounts because calendar event titles are server data the server already holds in the clear: it fetched them from the remote calendar, and they are never in the op log. The edit route sends titles to the remote calendar as typed, so on an encrypted account the server learns nothing new and nothing is encrypted. Event titles are not content fields (`internal/e2ee/contentfields.go` is unchanged), and task titles are never involved. `list_calendar_events` is available on encrypted accounts because it exposes only data the server already holds; `internal/agenttools/encrypted.go` has no content fields to rewrite for it.

### D10. Size and cost

No new dependency. Server: roughly 600 lines of Go, a few KB of binary. Web: `calendarEventEdits.ts`, the popover editor and the drag generalisation, expected under 6 KB gzip, in the calendar route chunk (to be confirmed with `make bundle-budget`; if the first-load budget moves, raise `web/bundle-budget.json` on purpose and say so in the pull request). Runtime memory: nothing resident beyond the two tables of D2 (one row per cached event over the 460-day window of the shown calendars) and a Dexie table of a few rows. Go files and functions stay inside the `internal/codesize` limits (150 lines per function, 1,100 per file), which is why `events.go`, `event_dav.go`, `event_graph.go` and `calsync_events.go` are separate files.

### D11. Test plan

Go (`go test ./...`):

- `internal/calsync/calsynctest/server.go`: the fake CalDAV server already answers `PUT` and `DELETE` with `If-Match` (`precondition`); add `SetPrivileges(calendar, ...)` for the privilege set, objects with attendees or recurrence, and a counter per method. `internal/calsync/graphtest/server.go`: extend `Event` with `type`, `isOrganizer`, `attendees`; `RaceNextPatch` (exists) covers 412.
- `internal/calsync/event_dav_test.go`, `event_graph_test.go`: update and delete happy paths; 412; 404; 403; unknown `X-` properties, alarms and a second component survive a DAV update unchanged except `SUMMARY`, `DTSTART`, `DTEND`, `SEQUENCE`, `DTSTAMP`, `LAST-MODIFIED`; `DURATION` becomes `DTEND`; locked cases (recurring, guests, not organizer); no write is ever sent without `If-Match`.
- `internal/calfeed/event_refs_test.go`: `StoreManagedRefs` writes one ref per occurrence, replaces on re-read, cascades on subscription delete; `EventID` equals the id `EventsOf` serves.
- `internal/store/calendar_event_edits_migration_test.go`: runs twice; the older queries of calendar sync and feeds still pass with the new tables present.
- `internal/httpapi/calsync_events_test.go`: every row of D4's error table, authentication (401, token scope, another user's event 404), the demo denial, the rate limit, `edit_events` off by default, one `Notify` per write, the audit event, `rev` and `access` on the events route.
- `internal/agenttools/calendar_events_test.go`, `internal/cli/calendar_events_test.go`: gate codes (`writes_disabled_by_owner`, `writes_disabled_by_user`, `token_scope`), limits, results, exit codes.
- `internal/audit`: the new event is in the closed catalogue and its documentation.

Web (`npm test` and `npm run build` in `web/`): `calendarEventEdits.test.ts` (fake-indexeddb: coalescing, delete wins, rollback on 409, flush order, offline then online, `next` after the id swap, `refreshEvents` re-applies the outbox, Undo, sign-out clears the table); `CalendarEvents.test.tsx` (popover editor, locked reasons, keyboard moves, Delete); `calendarDrag` event cases; `dates.test.ts` for `eventPointIn` across zones and DST; `dragAlternatives.test.ts`; `calendarSyncSettings.test.tsx` (the switch); stories for the new block states (the `projectedBlock.stories.tsx` pattern). `make ux-audit` for the new overlay entry, `make check` before the last task.

## Risks

- **Google's CalDAV privilege sets** for subscribed or holiday calendars are unverified; D3's 403 learning covers a wrong claim at the cost of one refused write.
- **A server that re-serialises an object on PUT** may drop properties it does not know; we send them all back, and the post-write read shows what the server kept.
- **Graph `$select` growth** (`attendees`) enlarges the window read for Microsoft connections; guests are the price of not sending invitations by accident. If it proves heavy, read `attendees` only for events that have `isOrganizer` true.
- **Id change on move** means a rapid second drag on the same block races the swap; the outbox `next` field and the swap in one transaction cover it, and a test names it.

**As built (review fixes, 2026-11-13).** Maintainer review on OpenTodoApp/OpenTodo#1233 asked for three things, and this design now follows them:

- **Writes go through the sync cycle, not the browser.** `Worker.EditEvent` and `Worker.DeleteEvent` (`internal/calsync`; `CreateEvent` and `Respond` come with the later changes) take `Worker.lock(connID)`, write with the cycle's transports (CalDAV and Google CalDAV with `If-Match`, Microsoft Graph with `If-Match`), update the connection's cache (`calendar_events`, `calendar_event_remote`) and wake devices. The browser sends a command and renders the answer. Only the cycle's task-snapshot comparison is not reused (D1).
- **Failures and conflicts are visible, not retried silently.** A write that fails while the device is online (server error, rate limit, calendar unreachable, no answer) is no longer retried in the background: the command stays in the outbox as a failed state with Retry and Discard (D6). A conflict (409) is shown and rolled back as before. Only a command made while offline waits, visibly, and is sent when the device is back online.
- **Encrypted accounts** are addressed in D9: editing works there because event titles are server data the server already reads.

Why: a background retry hid a failed write from the person, who may need to change it or drop it. The visible state keeps that decision with them.
