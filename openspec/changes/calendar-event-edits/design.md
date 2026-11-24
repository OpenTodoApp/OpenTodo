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
- **The web cache is replaced wholesale.** `refreshEvents` (`web/src/lib/calendarFeeds.ts`) clears `calendarEvents` and `calendarSubscriptions` and bulk-puts the response; Dexie is at version 32 (`web/src/lib/db.ts`, `habitTallies`).
- **DAV requests follow redirects by hand.** `DAV.Do` (`dav.go`) follows up to `MaxRedirects` redirects within the account's site, keeping the method and body; `Graph.do` refuses every redirect.
- **Tokens limited to workspaces are closed by default.** A route without `.Reach()` answers them `403 token_restricted` (`admits`, `internal/httpapi/policy.go`), and a tool outside `reachTools` (`internal/agenttools/reach.go`) answers `token_restricted`.
- **Agent writes are change sets of ops**, applied by `Registry.Apply` (`internal/agenttools/apply.go`), except `Plan.exec`, the escape hatch `run_routine` uses for a call that is no change set (`registry.go:176`).

## Goals / Non-Goals

**Goals:** move, resize, rename and delete plain events of opted-in connections from the Day and Week grid, the keyboard and the CLI, and let assistants move and rename them when the user allows it, with an undo; remote stays the source of truth; one clear conflict rule; works offline with an outbox; stock OpenTodo stays downgrade-safe.

**Non-Goals:** create events, recurring events, guests, assistants deleting events, the in-app assistant changing events, moving an event between calendars, ICS feed events, Month and Year drags, events as synced entities.

## Decisions

### D1. Event edits are not operations

Events live in somebody else's calendar and are cached server-side only (`calendar-feeds`: server data, never in the op log, the export or a backup). An op would invent a second source of truth and make two devices converge on a value the remote may have refused. So:

- `internal/sync/ops.go` `Schema` is untouched, `docs/sync.md` gets no new field, and `internal/writepaths` has nothing to allow-list.
- The device patches its Dexie cache optimistically and queues a **command** in a local outbox (D6). The server executes the command against the remote calendar and answers with the event as the remote now holds it.
- Convergence: every device converges on the remote's state because every device re-reads the cache from the server (`NotifyCalendar`, then `refreshEvents`). Two devices editing the same event offline: the first command to reach the server wins, the second gets `409 event_changed` (D5) and rolls back to the winner's state.

Rejected: an `event_override` op entity (a second truth, orphaned when the remote changes, raises E2EE and export questions); reusing the cycle's task-snapshot comparison for event writes (it compares task snapshots and cannot express "this foreign event changed"). Event writes do go through `internal/calsync` on the server: they take the connection's cycle lock (`Worker.lock(connID)`) and use the cycle's transports and conditional writes (`If-Match`). The browser only sends the command.

### D2. Event identity and the migration (0075)

The client identifies an event by **`(connection id, event id)`**, where the event id is the existing `EventRow.id` (24 hex characters). The server resolves it to the remote address (connection -> calendar URL -> event href or Graph id) through a new table, so the client never sees or sends an href:

```sql
-- 0075_calendar_event_edits.sql (idempotent: IF NOT EXISTS only, no ALTER)
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

-- A row means "Edit events in OpenTodo" is on for the connection;
-- assistants = 1 means "Let assistants edit events" is on too (D12).
CREATE TABLE IF NOT EXISTS calsync_event_edit (
  connection_id TEXT PRIMARY KEY REFERENCES calsync_connections(id) ON DELETE CASCADE,
  assistants    INTEGER NOT NULL DEFAULT 0
);

-- The account's own calendar addresses (CalDAV calendar-user-address-set,
-- the Google account's email), for the not_organizer lock.
CREATE TABLE IF NOT EXISTS calsync_account_addresses (
  connection_id TEXT NOT NULL REFERENCES calsync_connections(id) ON DELETE CASCADE,
  address       TEXT NOT NULL,              -- lower case, without "mailto:"
  PRIMARY KEY (connection_id, address)
);

-- The values an assistant's edit replaced, so the user can undo it (D12).
CREATE TABLE IF NOT EXISTS calendar_event_undo (
  connection_id TEXT NOT NULL REFERENCES calsync_connections(id) ON DELETE CASCADE,
  event_id      TEXT NOT NULL,              -- the event's id after the assistant's edit
  summary       TEXT,                       -- NULL when the edit kept it
  start_json    TEXT,                       -- {date, time?, tz?}; NULL when the edit kept the time
  end_json      TEXT,
  all_day       INTEGER,
  etag          TEXT NOT NULL,              -- the version the assistant's write produced
  token_id      TEXT NOT NULL,
  created_at    INTEGER NOT NULL,           -- Unix ms; kept 30 days
  PRIMARY KEY (connection_id, event_id)
);

-- Managed calendars have no remote refs yet: read them once more.
UPDATE calendar_subscriptions SET etag = ''
  WHERE id IN (SELECT subscription_id FROM calsync_calendars);
```

Why side tables and not nullable columns on `calendar_events` and `calsync_connections`: SQLite's `ALTER TABLE ADD COLUMN` cannot be repeated, so each column needs a Go step (`internal/store/audit_chain.go` is the pattern; `0037` explains). Side tables need none, are idempotent as plain SQL, and follow `calsync_scopes` (`0063_sync_scope.sql`): an older binary never reads them, a row without one means "off", and `calendar_events` and `calsync_connections` keep their exact columns, so downgrade-safety is stronger than with columns. This departs from "add nullable cache columns" on purpose and keeps its intent. The closing `UPDATE` makes the next cycle re-read every managed calendar once (`readCalendars` skips a calendar whose version equals `m.Version`, stored in `calendar_subscriptions.etag`), which fills `calendar_event_remote`; until then `access.reason` is `refresh_pending`. Migration number: **0075** (`0074_dav_push_subscriptions.sql` is the last on `main`; renumber again if another lands first). Downgrade: an older binary ignores the four tables, and the reset `etag` costs it one refetch.

`StoreManaged` gains a sibling `StoreManagedRefs` (same transaction, implemented as `Result.Refs`, a `calfeed.EventRemote` per uid that `Store.Success` writes with the occurrences; `StoreManaged` itself leaves a calendar without refs until its next read): `readCalendars` builds `uid -> {href, etag, locked}` from the `remote` objects it already holds (`o.Href`, `o.ETag`, the parsed events) and writes one `calendar_event_remote` row per stored occurrence. `EventRow` carries the join (`Rev`, and `Managed`, `Known`, `Locked` that are never serialised); the events route turns them into `access` with `calsync.AccessOf`, which `Worker.EditEvent` uses for its answer too. The `event_id` is the hash `EventsOf` computes today, moved into one exported helper `calfeed.EventID(subscriptionID, uid, instance)`. Rows of a re-read calendar are replaced together with its events (delete, then insert, as `Success` does for `calendar_events`), so refs never outlive their events.

A move changes the instance, hence the `id` (Context). A successful `PATCH` therefore answers with the new row and `replaces`, the old id; the client swaps rows (D6). Rejected: giving non-recurring managed events an empty instance so ids stay stable (it changes every id on upgrade and diverges from the feeds' keying; the swap is cheap).

`locked` is computed when the event is read, and the first reason that applies is kept, in the order of this table. The organiser lock stands beside the guest and recurrence locks: an event someone else organised but that lists no guests (a forwarded invitation, a delegated calendar) is still theirs to change. The account's addresses come from discovery: `Discover` (`discover.go`) also asks the principal for `calendar-user-address-set` (RFC 6638), a Google connection adds its account email, and `Store.SetAddresses` replaces the connection's rows on every discovery (`Rediscover` included). `ORGANIZER` values compare case-insensitively without `mailto:`.

| Reason | DAV (CalDAV, Google) | Graph |
| --- | --- | --- |
| `recurring` | the master has `RRULE`, `RDATE` or `EXDATE`, or the object holds a `RECURRENCE-ID` override | `type` is not `singleInstance` (`$select` in `graph.go` gains `type`) |
| `has_guests` | the VEVENT has an `ATTENDEE` (new `calfeed.Event.Guests` set in `vevent.go`); editing would make the server send iTIP updates to people | `attendees` is not empty (`$select` gains `attendees`) |
| `not_organizer` | the VEVENT has an `ORGANIZER` whose address is not one of the account's (`calsync_account_addresses`: the principal's `calendar-user-address-set`, read by discovery, plus the Google account's email); with no address known, any `ORGANIZER` locks | `isOrganizer` is false (`$select` gains `isOrganizer`) |
| `no_etag` | the server sent no ETag | no `@odata.etag` |

### D3. Capabilities per calendar and per event

`Calendar` (`calsync.go`) gains `Caps *Caps` (`json:"caps,omitempty"`, `{create, update, delete}`), stored in the connection's existing `calendars` JSON (additive; older binaries ignore it):

- DAV (`discover.go`: `readOnly` becomes `capsOf`): `bind` gives create, `write-content` gives update, `unbind` gives delete; `write` or `all` give all three; no privilege set gives all three unless `ReadOnly`.
- Graph (`graph.go`): `canEdit` gives all three, else none (Graph has no finer flag).
- A calendar saved before this change has no `Caps`; the server derives `{!ReadOnly, !ReadOnly, !ReadOnly}`. `Rediscover` (`run.go:129`) refreshes them.
- A write refused with 403 answers `403 calendar_read_only` and sets that calendar's caps to false until the next discovery (a privilege set can claim more than the server allows; Google's CalDAV answers for read-only calendars are unverified).
- `create` is served for the next phase and used by nothing in this change.

The connection view always serves `calendars[].caps` (derived from `read_only` for a calendar saved before caps existed). The events route serves, per managed event, `access: {update, delete, reason?}`: `update` and `delete` are true only when the connection has `edit_events`, the calendar's cap allows it and `locked` is empty. The reason is the first unmet condition: `edits_off`, `calendar_read_only`, a `locked` reason (`recurring`, `has_guests`, `not_organizer`, `no_etag`), then `refresh_pending`; a calendar that allows only one of update and delete serves `calendar_read_only` for the one it forbids. The UI starts a drag only when `access.update` and shows the reason otherwise; the server re-checks everything on the write (the client flags are hints, not the gate).

### D4. REST contract

All routes sit behind the calendar sync switch (404 `calendar_sync_disabled` while off) and are registered in `internal/httpapi/calsync.go` as `mux.handle(pattern, signedIn.DemoDenied(), gate(handler))`, like the other connection writes; the public demo already refuses every `/api/v1/calendar-sync` and `/api/v1/calendar-feeds` route (`internal/httpapi/demo.go`), and a test names the new routes in that list. Read and agent tokens already get 403 on non-GET calendar sync routes (`docs/api.md`, calendar sync section); the CLI uses a full token.

**Tokens limited to chosen workspaces cannot use any event route.** None of the event routes, nor `GET /api/v1/calendar-feeds/events`, declares `.Reach()`, so `admits` answers `403 token_restricted` before the handler runs: calendars belong to the whole account, not to a workspace. `calsync_events_test.go` sends the events route, `PATCH`, `DELETE` and the undo with a workspace-limited full token and expects `403 token_restricted` and no request to the calendar. Handlers live in `internal/httpapi/calsync_events.go`.

```
PATCH /api/v1/calendar-sync/connections/{id}
  body gains:  {"edit_events": true, "assistant_edits": true}   // both off by default (D12)
  view gains:  "edit_events": false, "assistant_edits": false,
               and calendars[].caps {create, update, delete}

GET /api/v1/calendar-feeds/events?from=&to=      // request unchanged
  each event gains:  "rev": "a41c9d03e2b7f610",
                     "access": {"update": true, "delete": true}
                     // or {"update": false, "delete": false, "reason": "recurring"}
                     "changedBy": {"kind": "assistant", "name": "Claude"}
                     // only while an assistant's edit can be undone (D12)
                     // "access" and "changedBy" are absent for ICS feed events
  managed subscriptions[] gain: "connectionId", "calendarUrl", "caps", "editEvents"

PATCH /api/v1/calendar-sync/connections/{id}/events/{eventId}
  body: {
    "rev": "a41c9d03e2b7f610",                   // required: the rev the client saw
    "summary": "Standup",                        // optional; control characters removed, then 1 to 500 characters
    "start": {"date": "2026-11-12", "time": "14:00", "tz": "Europe/Berlin"},
    "end":   {"date": "2026-11-12", "time": "14:30", "tz": "Europe/Berlin"},
    "allDay": false                              // optional; start and end go together
  }
  200: {"event": <the event as the events route serves it: new id, rev, access>,
        "replaces": "<old id>"}
  // body: JSON of at most 4 KB (413 too_large above), unknown members refused
  // date "YYYY-MM-DD"; time "HH:MM", 24-hour, 00:00 to 23:59; tz an IANA zone name
  // all-day: start and end are dates without time or tz, end exclusive;
  // a timed point without "tz" is floating

DELETE /api/v1/calendar-sync/connections/{id}/events/{eventId}?rev=a41c9d03e2b7f610
  204

POST /api/v1/calendar-sync/connections/{id}/events/{eventId}/undo   // an assistant's edit (D12)
  200: {"event": <as for PATCH>, "replaces": "<id before the undo>"}
```

**Summary rules.** Before any other check the server removes every control character from `summary` (Unicode category Cc, which holds CR, LF, TAB and NUL, plus U+2028 and U+2029) and trims surrounding white space; what remains must be 1 to 500 characters, else `400 invalid_input` naming `summary`. One function, `calsync.CleanSummary`, serves the route, the agent tool and the undo, so a title can never carry a line break into the iCalendar object (D5).

`{id}` is the connection id, `{eventId}` the `id` of the event row. `rev` is the first 16 hex characters of SHA-256 of the stored ETag (`hash16`, `calsync.go`), so ETags are never exposed. The server finds the event through `calendar_event_remote` joined to the connection's managed subscriptions (`calsync_calendars`), so another user's or another connection's event is `404 not_found`.

Errors (the standard `{error:{code,message}}` envelope):

| Status | Code | When |
| --- | --- | --- |
| 401 | `unauthorized` | no credentials |
| 403 | `demo_restricted` | public demo (policy, before authentication) |
| 403 | `forbidden` | a read or agent token (existing rule) |
| 403 | `token_restricted` | a token limited to chosen workspaces (no `.Reach()`) |
| 404 | `calendar_sync_disabled` | the owner's switch is off |
| 404 | `not_found` | the connection or event is not the caller's, or the event is not cached |
| 403 | `event_edits_off` | the connection's `edit_events` is off |
| 403 | `calendar_read_only` | the calendar's cap forbids it, or the remote answered 403 |
| 422 | `event_not_editable` | locked; the message names the reason (`recurring`, `has_guests`, `not_organizer`, `no_etag`) |
| 413 | `too_large` | a PATCH body over 4 KB |
| 400 | `invalid_input` | malformed body, unknown member, `start` without `end`, end not after start, unknown `tz`, empty or over-long `summary`, nothing to change (the field is named) |
| 409 | `event_changed` | `rev` is not the stored one, or the remote answered 412; nothing was written |
| 404 | `event_gone` | the remote answered 404; the cached row is dropped and devices are woken |
| 429 | `rate_limited` | more than 600 event writes an hour per user (a `calsync.event` limiter, like `calsyncLimiter`) |
| 502 | `calendar_unreachable` | the remote failed; the message is the reason code, as `remoteError` does (`unauthorized_remote` for a refused credential, `redirect_refused` for any 3xx answer to a write) |

A successful write does, in order and under `Worker.lock(connID)` (the cycle's mutex): resolve and check; call the `EventWriter`; in one transaction update `calendar_events` (summary, start, end, all-day), `calendar_event_remote` (new `event_id` and `etag`) and reset the subscription's `etag` to `''` so the next cycle re-reads that calendar; call `Notify(userID)` (`NotifyCalendar`) so other devices refetch; the caller then records the audit event `calendar_event.changed` (a new name in `internal/audit/events.go` with the connection id, provider and action `updated`, `deleted` or `undone` under the new detail key `event_action`, and the token id for an assistant's edit, never a title): the REST handlers do it today, and the agent tools of group 6 do it in their `EventEditor`. The writing device already holds the answer. `Worker.EditEvent` and `DeleteEvent` return an `*EventResult` (the row, `replaces`, provider) or an `*EventError` whose `Code` is one of the codes of the table above (`Reason` names the lock or the remote failure); the handler only maps them onto statuses. A remote 412 and a stale ETag found by the DAV or Graph pre-read are both `event_changed`.

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

**No redirects on writes.** Every event write (`PUT`, `PATCH`, `DELETE`) is sent once and never follows a redirect: DAV writes go through a new `DAV.DoOnce` (the body of `Do` without the redirect loop), where any 3xx answer is `&Error{Reason: ReasonRedirect}`. `DoOnce` keeps everything else of `Do`: the connection's outbound client (`d.HTTP`, built on `ob.Dialer`, which refuses private addresses unless the owner allowed them), `ob.ValidateURL` and the per-request `sameSite` check before credentials are added, so an event href on another host or a private address is refused before anything is sent; `Graph.do` already refuses redirects. The writer maps it to `502 calendar_unreachable` with the reason `redirect_refused`, and nothing is cached. Why: `Do` re-sends the method and body to the redirect target, so a calendar server, or something in front of it, could turn one conditional write into a write elsewhere; for an edit of someone's calendar the safe answer is to stop. Reads (`Read`, the pre-read of `Update`) keep `Do`'s same-site redirects, like the cycle. `event_dav_test.go` and `event_graph_test.go` answer each write method with 301, 302, 307 and 308 and check that one request was sent, the error is `redirect_refused` and the cached row is unchanged; a stored href on another host, and one on a private address, are refused with no request sent and so no credentials.

**DAV** (`internal/calsync/event_dav.go`; a new `DAV.getObject` returns the body and ETag beside `DAV.get`). `Update` reads the resource, compares its ETag with `ref.ETag` (a mismatch is `ErrEventChanged` without writing), parses it with `caldav.Parse` into the component tree and locks it if the master holds `ATTENDEE`, `RRULE`, `RDATE` or `EXDATE`, an `ORGANIZER` that is not the account's, or the object holds an override. It edits **only** `SUMMARY`, `DTSTART` and `DTEND` (a `DURATION` is replaced by `DTEND`), bumps `SEQUENCE`, sets `DTSTAMP` and `LAST-MODIFIED`, adds a `VTIMEZONE` with `caldav.VTimezone` when a new `TZID` needs one, re-encodes the **whole VCALENDAR** with `Component.Encode` (unknown properties, alarms, `X-` properties and other components survive). `caldav.Prop.Value` holds the value as it is written, already escaped (`internal/caldav/ical.go`), and `Component.Encode` only folds lines, so the writer sets `Value = caldav.EscapeText(CleanSummary(s))`: control characters are removed first (D4), then `\`, `;`, `,` and newlines are escaped, and the value cannot end the property line and PUTs it with `If-Match: ref.ETag`. A server that answers 2xx without an ETag header is read once more for it. 412 gives `ErrEventChanged`, 404 `ErrEventGone`, 403 `ErrCalendarRO`. `Delete` sends `DELETE` with `If-Match`. `DAV.Do` already keeps credentials on the account's host.

**Graph** (`internal/calsync/event_graph.go`): `PATCH /me/events/{id}` (sent once, no redirect) with `If-Match: <@odata.etag>` and only the changed members of `{subject, start, end, isAllDay}` (times with helpers beside `graphTimes` in `graph_events.go`, zones through `zoned.WindowsName`, a zone without a Windows id written as the same instant in UTC, as for tasks); `DELETE` with `If-Match`; `Read` is a `GET` with `$select=id,subject,start,end,isAllDay,showAs,type,isOrganizer,attendees,location`. 412 gives `ErrEventChanged`, 404 `ErrEventGone`, 403 `ErrCalendarRO`. Throttling reuses `Graph.do`'s `Retry-After` handling.

**Conflict rule.** The server never overwrites a version the user did not see: the client's `rev` must equal the stored ETag's hash and the remote must still hold that ETag (`If-Match`). Anything else is `409 event_changed` with nothing written. The client rolls its optimistic patch back, refetches the range and shows "<title> changed in your calendar; your edit was not applied." No merge: the user redoes the edit on the fresh event. This is deliberately not the "newest change wins" rule of task sync (`calendar-sync`, "Conflicts resolve to the newest change"): that rule exists because tasks are ours; here the calendar owns the event.

**Side effects.** Events with guests or another organiser are locked (D2), so no write sends an invitation update or changes someone else's meeting.

**A title cannot add properties.** `event_dav_test.go` sends summaries holding `\r\nATTENDEE:mailto:x@example.com`, `\nEND:VEVENT\nBEGIN:VEVENT`, a lone `\r`, U+2028 and 600 characters, and checks that each PUT body parses to the same properties and components as the object it replaced, with only `SUMMARY` and the bookkeeping properties changed, or that the request was refused with `400 invalid_input` before any write. Round-trip vectors: summaries holding `\`, `;`, `,` and the two characters `\n` are written as `\\`, `\;`, `\,` and `\\n`, and read back with `caldav.Parse` and `caldav.UnescapeText` as exactly the text sent.

### D6. Web data layer

New `web/src/lib/calendarEventEdits.ts` (outside the shared sync/ops import graph, so it may use `api` and `db`). Only the lazy calendar view imports it, and `refreshEvents` reaches it through a dynamic `import()`, so it is not in the first load (D10). Types in `web/src/lib/types.ts`: `CalendarEvent` gains `rev?: string` and `access?: {update: boolean; delete: boolean; reason?: string}`; `CalendarSubscription` gains `connectionId?`, `calendarUrl?`, `caps?`, `editEvents?`; `CalendarConnection` gains `edit_events?: boolean`; `SyncCalendar` gains `caps?`. `api.ts` gains `updateCalendarEvent(connectionId, eventId, body)` and `deleteCalendarEvent(connectionId, eventId, rev)`, and `CalendarConnectionPatch` gains `edit_events`.

**Dexie version 33** (`web/src/lib/db.ts`, after version 32): `this.version(33).stores({ eventOutbox: 'key, notBefore' })`, with `eventOutbox!: Table<EventCommand, string>` and the table added to the sign-out clear (`clearLocalData`). A v32 database upgrades to v33 and keeps its tables. `calendarEvents` keeps its schema.

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
- **One-click alternative to every drag** (WCAG 2.5.7, `scripts/ux-audit/drag-alternatives.json`): the event popover (today the read-only `EventDetails`) gains, when `access.update`, a title input, date, start and end time inputs and a Save button, and a Delete button when `access.delete`. Locked, it shows the reason ("Repeating events are read-only for now", "This event has guests", "Someone else organised this event", "This calendar is read-only", "Editing events is off for this connection" with a link to the connection's settings). An event an assistant changed shows "Changed by <name>" and an Undo button (D12). The editor is its own lazy component, loaded when an editable event's popover opens (D10). The drag map gets `{"id": "calendar-event", "what": "...", "alternatives": [{"file": "web/src/app/CalendarEvents.tsx", "contains": "data-event-edit"}]}`; `web/src/lib/a11y/dragAlternatives.test.ts` checks the source holds that text.
- **Rendering.** A queued edit shows the block dimmed with `aria-busy`; a conflict shows the toast. Locked events show the reason in the existing `Tooltip`.
- **Settings.** `web/src/app/CalendarSyncDialogs.tsx` (the connection card) gets the switch "Edit events in OpenTodo" and, below it and only while it is on, "Let assistants edit events" (D12), both off by default and without helper text; a calendar the account marks read-only says so in its row.

**Interface budget** (`docs/interface-guide.md`): no new row of chrome above the grid (0 of 2 used by this change); no new task property; no new sidebar destination; no new scroll region (the popover editor is the existing popover with a few fields); two new switches on the existing connection card, the second shown only while the first is on; `calendar.delete` is the only new shortcut and is registered conflict-free, the other four are existing ids with a wider target.

### D8. Agents and the CLI

- **Two tools, no delete.** `internal/agenttools` gets a read tool `list_calendar_events` (`{from, to}`, both required, at most 92 days) and one write tool `update_calendar_event` (`{connection_id, event_id, rev, summary?, start?, end?, all_day?}`), in `read_calendar_events.go` and `write_calendar_events.go`. There is **no `delete_calendar_event`** in this phase: an assistant that misreads a request can move an event back, but a deleted event cannot be restored (there is no create here), so deleting stays with the person, in the calendar view and the CLI. A registry test checks that no tool whose name holds `calendar_event` deletes, and the existing test that forbids `delete` in tool names keeps no exception.
- **The gate.** `update_calendar_event` goes through the existing write gate (`Caller.WriteDenial`: the owner's `mcp.writes`, the user's switch, an `agent` token), the per-token limits and the `agent.write` audit, and then through the per-connection gate of D12: the connection's "Edit events in OpenTodo" **and** "Let assistants edit events" must both be on, else `assistant_edits_off` (or `event_edits_off` when the first is off). The tool is not a change set: planning validates the arguments (`CleanSummary` and the PATCH body rules) and returns a `Plan` whose `exec` (the `run_routine` pattern, `registry.go:176`) calls an `EventEditor` interface given to the registry at construction (`Options.EventEditor`, implemented as `calendarEventEditor` in `internal/httpapi/agent_calendar_events.go` over the same `calsync.Worker.EditEvent` the REST handler calls), so checks, locks, the conditional write, audit and notification are identical. The interface (`internal/agenttools/calendar_events.go`) has `Events`, `Validate` and `Update` over plain agenttools types, so the package does not import `calsync` or `calfeed`. The editor also checks the calendar sync switch (`calendar_sync_disabled`) and the 600 an hour limiter, records `calendar_event.changed` with the token id, and keeps the undo of D12. A write is one item of the per-token daily limit, held through `exec` and returned when the write fails. Tool errors use the REST codes of D4.
- **What the read tool returns.** The events the calendar view shows, including feed events (no `connection_id`, `rev` or `access`). For an event of a connection it returns `connection_id`, `rev` and `access: {update, reason?}` as the assistant may use it: `update` is true only when the event is editable (D3) and the connection allows assistants; the reason is the first of D3's, then `assistant_edits_off`. There is no `delete` member. Titles and locations are in `untrusted_text`.
- **Workspace-limited tokens.** Neither tool is in `reachTools` (`internal/agenttools/reach.go`), so a token limited to chosen workspaces gets `token_restricted` from both, before planning and before the calendar is contacted; `calendar_events_test.go` checks both tools with such a token, and `TestReachToolsAreKnown` keeps them out of the list.
- **The in-app assistant** does not offer either tool (`notInApp` in `internal/assistant/loop.go`): the write is not a change set, so the review screen cannot hold it (the reason `run_routine` is not offered), and the read tool returns event titles that the assistant disclosure (`consentFields`) does not name. Offering the read tool there needs a disclosure line first.
- `internal/cli` (`cmd_calendar_events.go`, registered in `commands.go`): `ot calendar events [--from D] [--to D] [--json]` (a table of ID, DATE, TIME, TITLE, CALENDAR, ACCESS), `ot calendar event edit <id> [--title T] [--start DATE[Thh:mm]] [--end ...] [--all-day]` and `ot calendar event delete <id>`. They call the REST routes, taking the connection from the event's subscription. A `read` token can list; edits and deletes need a `full` token, so an `agent` token cannot delete through `ot` either. `ot calendar` alone is `ot calendar events`. `edit` and `delete` find the event by id or unique id prefix within 45 days of today, and take `--on <day>` to look around another day (the events route needs a date range and has no lookup by id). A new `--start` alone keeps the event's length; a date alone keeps the clock time; a timed event keeps its time zone. `event_edits_off` and `calendar_read_only` exit 5 (a switch, a capability); `event_changed`, `event_not_editable`, `event_gone` and `calendar_unreachable` exit 1. A read or agent token is refused locally by the write gate before anything is sent (exit 5); no token is the usual usage error (exit 2) and a rejected one a 401 (exit 3). Completion learns one more level (`calendar event edit|delete`).
- `internal/httpapi/testdata/v1_surface.json` is regenerated with `-update` (additive): the new MCP tools, the `ot calendar` commands, routes and error codes.

### D9. E2EE

Editing works on encrypted accounts because calendar event titles are server data the server already holds in the clear: it fetched them from the remote calendar, and they are never in the op log. The edit route sends titles to the remote calendar as typed, so on an encrypted account the server learns nothing new and nothing is encrypted. Event titles are not content fields (`internal/e2ee/contentfields.go` is unchanged), and task titles are never involved. `list_calendar_events` is available on encrypted accounts because it exposes only data the server already holds; `internal/agenttools/encrypted.go` has no content fields to rewrite for it. The undo row of D12 holds a title the server already held.

### D10. Size and cost

No new dependency. Server: roughly 800 lines of Go, a few KB of binary. Web: `calendarEventEdits.ts`, the popover editor and the drag generalisation, expected under 6 KB gzip, all in the lazy calendar view's chunk (`Shell.tsx` loads `CalendarView` with `lazy`). The first-load budget (`web/bundle-budget.json`) is nearly full, so nothing of this change may join the first load except the Dexie v33 table declaration in `db.ts` (a few bytes): `calendarFeeds.ts`, which is in the first load, re-applies queued patches by reading `db.eventOutbox` directly and reaches `flushEventEdits` with a dynamic `import()`; the popover editor is its own lazy component, loaded when an editable event's popover opens. `make bundle-budget` must pass without raising the budget; the pull request reports the gzip delta of the first load and of the calendar chunk. Runtime memory: nothing resident beyond the tables of D2 (one ref row per cached event over the 460-day window of the shown calendars, one undo row per assistant edit for at most 30 days) and a Dexie table of a few rows. Go files and functions stay inside the `internal/codesize` limits (150 lines per function, 1,100 per file), which is why `events.go`, `event_dav.go`, `event_graph.go`, `event_undo.go` and `calsync_events.go` are separate files.

### D11. Test plan

Go (`go test ./...`):

- `internal/calsync/calsynctest/server.go`: the fake CalDAV server already answers `PUT` and `DELETE` with `If-Match` (`precondition`); add `SetPrivileges(calendar, ...)` for the privilege set, objects with attendees, an organiser or recurrence, the principal's `calendar-user-address-set`, a per-method counter and a way to answer the next request with a redirect. `internal/calsync/graphtest/server.go`: extend `Event` with `type`, `isOrganizer`, `attendees`; `RaceNextPatch` (exists) covers 412.
- `internal/calsync/event_dav_test.go`, `event_graph_test.go`: update and delete happy paths; 412; 404; 403; unknown `X-` properties, alarms and a second component survive a DAV update unchanged except `SUMMARY`, `DTSTART`, `DTEND`, `SEQUENCE`, `DTSTAMP`, `LAST-MODIFIED`; `DURATION` becomes `DTEND`; locked cases (recurring, guests, an organiser who is not the account, an organiser who is, Graph `isOrganizer` false); no write is ever sent without `If-Match`; a 301, 302, 307 or 308 answer to each write is one request and `redirect_refused`; a summary cannot add properties or components (D5).
- `internal/calsync/clean_test.go`: `CleanSummary` removes every Cc character, U+2028 and U+2029, trims, and refuses empty and over-500-character results.
- `internal/calsync/event_undo_test.go`: an assistant's edit keeps the previous title and time; the undo restores them with `If-Match` on the ETag the assistant's write produced; an event changed since is `409 event_changed` with nothing written; a user's own edit keeps no undo and replaces the assistant's; undo rows go after 30 days and with the connection.
- `internal/calfeed/event_refs_test.go`: `StoreManagedRefs` writes one ref per occurrence, replaces on re-read, cascades on subscription delete; `EventID` equals the id `EventsOf` serves.
- `internal/store/calendar_event_edits_migration_test.go`: runs twice; the older queries of calendar sync and feeds still pass with the new tables present.
- `internal/httpapi/calsync_events_test.go`: every row of D4's error table, authentication (401, token scope, another user's event 404), a workspace-limited token's `403 token_restricted` on the events route, `PATCH`, `DELETE` and undo, the demo denial, the rate limit, `edit_events` and `assistant_edits` off by default, one `Notify` per write, the audit event, `rev` and `access` on the events route.
- `internal/agenttools/calendar_events_test.go`: the tool list holds `list_calendar_events` and `update_calendar_event` and no tool that deletes an event; gate codes (`writes_disabled_by_owner`, `writes_disabled_by_user`, `token_scope`, `assistant_edits_off`, `token_restricted`), limits, results, the stale `rev`. `internal/cli/calendar_events_test.go`: exit codes.
- `internal/audit`: the new event is in the closed catalogue and its documentation.

Web (`npm test` and `npm run build` in `web/`): `calendarEventEdits.test.ts` (fake-indexeddb: coalescing, delete wins, rollback on 409, flush order, offline then online, `next` after the id swap, `refreshEvents` re-applies the outbox, Undo, sign-out clears the table); `CalendarEvents.test.tsx` (popover editor, locked reasons, keyboard moves, Delete, an assistant's change with Undo); `calendarDrag` event cases; `dates.test.ts` for `eventPointIn` across zones and DST; `dragAlternatives.test.ts`; `calendarSyncSettings.test.tsx` (both switches); stories for the new block states (the `projectedBlock.stories.tsx` pattern). `make ux-audit` for the new overlay entry, `make bundle-budget`, `make check` before the last task.

### D12. Assistants: a second switch and an undo

An assistant acts for the person but can misread them, and its edit lands in a calendar other people read. So:

- **A second per-connection option, "Let assistants edit events", off by default.** It is the `assistants` column of `calsync_event_edit` (D2), served as `assistant_edits` on the connection view and set with `PATCH /api/v1/calendar-sync/connections/{id}` `{"assistant_edits": true}` (a boolean, `400 invalid_input` otherwise, audited in the `changed` list like `edit_events`). It only has an effect while `edit_events` is on: turning `edit_events` off deletes the row, so both are off, and turning `assistant_edits` on while `edit_events` is off answers `400 invalid_input` naming `assistant_edits`. The connection card shows it under "Edit events in OpenTodo", only while that switch is on. The REST routes and the calendar view never read it: it gates `update_calendar_event` only.
- **Every assistant edit can be undone.** Before `update_calendar_event` writes, `Worker.EditEvent` (with an `Undo` flag the editor sets) keeps the fields the edit changes as the calendar held them (the `summary`, and `start`, `end` and `allDay` together), and after the write stores them in `calendar_event_undo` keyed by the event's new id with the ETag the write produced and the token id. `POST /api/v1/calendar-sync/connections/{id}/events/{eventId}/undo` (signed-in session or full token, `DemoDenied`, behind the switch, no `.Reach()`) restores those values through the same path as a `PATCH`: `Worker.lock`, the checks of D3 (with the edit option still on), `If-Match` on the stored ETag, and `409 event_changed` with nothing written when the event changed since the assistant's edit (the stored ETag is no longer the cached one, or the calendar answers 412); `404 not_found` when no undo is kept. A successful undo deletes the row and answers as a `PATCH`. A later edit by the person, a delete, an event that is gone and 30 days each remove the undo (the cleanup runs with the cycle). Undoing needs no assistant switch: turning the assistant switch off keeps the undo available.
- **Where the person finds it.** The events route serves `changedBy: "assistant"` and the token's name on an event with an undo (an additive member, absent otherwise), and the event popover shows "Changed by <name>" with an Undo button; the assistant's tool result says the change can be undone in OpenTodo. The audit log holds `agent.write` and `calendar_event.changed` with the token id and `event_action: updated`, and an undo adds `calendar_event.changed` with `event_action: undone`.
- Rejected: an undo through the task history (events are not ops, D1); keeping undo only in the browser (the assistant's edit did not come from a browser); letting the read tool's caller undo (the undo is the person's, not the assistant's).

## Risks

- **Google's CalDAV privilege sets** for subscribed or holiday calendars are unverified; D3's 403 learning covers a wrong claim at the cost of one refused write.
- **A server that re-serialises an object on PUT** may drop properties it does not know; we send them all back, and the post-write read shows what the server kept.
- **Graph `$select` growth** (`attendees`) enlarges the window read for Microsoft connections; guests are the price of not sending invitations by accident. If it proves heavy, read `attendees` only for events that have `isOrganizer` true.
- **Id change on move** means a rapid second drag on the same block races the swap; the outbox `next` field and the swap in one transaction cover it, and a test names it.
- **Accounts with several addresses.** A CalDAV account whose `calendar-user-address-set` misses one of the person's addresses locks their own organised events as `not_organizer`; that fails closed, and the popover says why.

## Review decisions

Maintainer review on OpenTodoApp/OpenTodo#1233 (2026-11-13):

- **Writes go through the sync cycle, not the browser.** `Worker.EditEvent` and `Worker.DeleteEvent` (`internal/calsync`) take `Worker.lock(connID)`, write with the cycle's transports (CalDAV and Google CalDAV with `If-Match`, Microsoft Graph with `If-Match`), update the connection's cache (`calendar_events`, `calendar_event_remote`) and wake devices. The browser sends a command and renders the answer. Only the cycle's task-snapshot comparison is not reused (D1).
- **Failures and conflicts are visible, not retried silently.** A write that fails while the device is online (server error, rate limit, calendar unreachable, no answer) is not retried in the background: the command stays in the outbox as a failed state with Retry and Discard (D6). A conflict (409) is shown and rolled back. Only a command made while offline waits, visibly, and is sent when the device is back online. Why: a background retry hides a failed write from the person, who may need to change it or drop it.
- **Encrypted accounts** are addressed in D9.

Security review on OpenTodoApp/OpenTodo#1485 (2026-11-18), six requirements:

1. Assistants get `list_calendar_events` and `update_calendar_event` only, no delete tool (D8).
2. Event writes never follow redirects; a 3xx is `calendar_unreachable` (D5).
3. An assistant's edit can be undone with the same conditional write (D12).
4. Assistants edit a connection's events only with "Let assistants edit events", off by default (D12).
5. An event someone else organised is locked: a CalDAV `ORGANIZER` that is not the account, Graph `isOrganizer` false (D2).
6. Workspace-limited tokens cannot use the event routes or tools (D4, D8); a summary is capped and stripped of control characters and cannot add iCalendar properties (D4, D5).

Also: Dexie v33 upgrading from v32 (D6), and migration `0075`, since `0074` went to `caldav-push` (D2).
