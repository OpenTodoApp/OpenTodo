## ADDED Requirements

### Requirement: Events can be changed and deleted in the connected calendar
While calendar sync is on, a signed-in user SHALL move, resize, rename and delete an event of a calendar of one of their connections through `PATCH` and `DELETE /api/v1/calendar-sync/connections/{id}/events/{eventId}`, when the connection's "Edit events in OpenTodo" is on, the calendar's capability allows the change and the event is not locked. The `PATCH` body SHALL carry the `rev` the caller saw and any of `summary`, `start` and `end` together, and `allDay`; it SHALL answer 200 with the event as the calendar now holds it (with its new `id`, `rev` and `access`) and `replaces`, the id it had. The `DELETE` SHALL carry `rev` and answer 204. The server SHALL write to the remote calendar with a precondition on the event's version, keep every property of the remote event it does not change, never send an invitation or update to guests, refresh its cached copy, record an audit event without the title and wake the user's other devices. The route SHALL answer 404 `calendar_sync_disabled` while the owner's switch is off, 403 `demo_restricted` on the public demo, 401 `unauthorized` without credentials, 403 `forbidden` to read and agent tokens, 403 `token_restricted` to tokens limited to chosen workspaces, 404 `not_found` for a connection or event that is not the caller's, 403 `event_edits_off`, 403 `calendar_read_only`, 422 `event_not_editable`, 400 `invalid_input`, 404 `event_gone`, 429 `rate_limited` over 600 changes an hour, and 502 `calendar_unreachable` when the calendar fails. Every write to the calendar (`PUT`, `PATCH`, `DELETE`) SHALL be sent once and SHALL NOT follow an HTTP redirect: a 3xx answer SHALL be a 502 `calendar_unreachable` error with the reason `redirect_refused`, with nothing cached. Before any other check the server SHALL remove every control character, U+2028 and U+2029 from `summary` and trim it; the result SHALL be 1 to 500 characters, and a summary SHALL NOT be able to add properties or components to the calendar object. An event edit SHALL NOT be an operation: it SHALL NOT appear in the op log, the export or a backup.

#### Scenario: Move an event
- **WHEN** a user PATCHes an event of 09:00 to 09:30 on 2026-11-12 with `start` 10:00 and `end` 10:30 the same day and its current `rev`
- **THEN** the calendar holds the event at 10:00 to 10:30, its alarms and other properties unchanged, the response carries the event with a new `id`, a new `rev` and `replaces` set to the old id, and the user's other devices show the new time without reloading

#### Scenario: Rename an event
- **WHEN** a user PATCHes `{"rev": "...", "summary": "Planning"}` on a CalDAV event
- **THEN** the calendar object is written back whole with `If-Match` and only the summary and the bookkeeping properties changed

#### Scenario: Delete an event
- **WHEN** a user sends `DELETE` with the event's `rev`
- **THEN** the calendar no longer holds the event, the response is 204, the cached copy is gone and other devices stop showing it

#### Scenario: Not an operation
- **WHEN** an event is moved
- **THEN** no operation is written, the export and a backup contain no trace of the edit, and a device that was offline learns the new time from the events route, not from sync

#### Scenario: Edits off
- **WHEN** a user PATCHes an event of a connection whose `edit_events` is off
- **THEN** the response is a 403 `event_edits_off` error and the calendar is not contacted

#### Scenario: Read-only calendar
- **WHEN** a user PATCHes an event of a calendar whose caps are false
- **THEN** the response is a 403 `calendar_read_only` error and nothing is written

#### Scenario: Invalid change
- **WHEN** a user sends `start` without `end`, an end before the start, an unknown time zone or an empty summary
- **THEN** the response is a 400 `invalid_input` error naming the field and nothing is written

#### Scenario: Another user's event
- **WHEN** a user PATCHes an event id of a different account, or an id that is not cached
- **THEN** the response is a 404 `not_found` error

#### Scenario: Unauthenticated
- **WHEN** either route is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Agent or read token
- **WHEN** a read token or an agent token calls either route
- **THEN** the response is a 403 `forbidden` error

#### Scenario: Token limited to workspaces
- **WHEN** a full token limited to chosen workspaces calls the events route, a PATCH or a DELETE of an event
- **THEN** the response is a 403 `token_restricted` error and the calendar is not contacted

#### Scenario: Redirected write
- **WHEN** the calendar server answers a PUT, PATCH or DELETE of an event with a 301, 302, 307 or 308
- **THEN** the redirect is not followed, exactly one write request was sent, the response is a 502 `calendar_unreachable` error naming `redirect_refused`, and the cached event is unchanged

#### Scenario: A title cannot add properties
- **WHEN** a user PATCHes a CalDAV event with a summary holding a line break followed by `ATTENDEE:mailto:x@example.com`, or `END:VEVENT` and `BEGIN:VEVENT` on their own lines
- **THEN** the control characters are removed, the calendar object written has the same properties and components as before with only the summary and the bookkeeping properties changed, and no attendee or event is added

#### Scenario: Over-long title
- **WHEN** a user PATCHes a summary of 501 characters, or one made only of control characters
- **THEN** the response is a 400 `invalid_input` error naming `summary` and nothing is written

#### Scenario: Calendar unreachable
- **WHEN** the calendar server times out during a write
- **THEN** the response is a 502 `calendar_unreachable` error naming the reason, nothing is changed in the cache and the connection's other settings are untouched

#### Scenario: Microsoft event
- **WHEN** a user moves a single Outlook event they organise and that has no attendees
- **THEN** the server sends Graph a `PATCH` with `If-Match` set to the event's `@odata.etag` and only `start` and `end`, and the response holds the event with Graph's new ETag's `rev`

### Requirement: Which events can be changed
An event SHALL be changeable only when it belongs to a connected calendar, its connection's "Edit events in OpenTodo" is on, its calendar's capability for the change is true, and it is a single event: not repeating, not an occurrence or exception of a series, without guests, organised by the account (a CalDAV or Google event whose `ORGANIZER` is not one of the account's calendar addresses, and a Microsoft event whose `isOrganizer` is false, are locked), and with a version the calendar reported. Events of subscribed (ICS) calendars SHALL never be changeable. An event OpenTodo wrote for a task SHALL keep behaving as a task and SHALL NOT be served as an editable event. For every event the server serves, `access` SHALL say whether it may be updated or deleted and give the first unmet condition as `reason`: `edits_off`, `calendar_read_only`, `recurring`, `has_guests`, `not_organizer`, `no_etag` or `refresh_pending`. The write routes SHALL check every condition again.

#### Scenario: Repeating event
- **WHEN** a calendar holds a weekly event
- **THEN** every occurrence is served with `access.reason: "recurring"`, a PATCH or DELETE of one answers 422 `event_not_editable`, and the popover says repeating events are read-only for now

#### Scenario: Event with guests
- **WHEN** a CalDAV event has an `ATTENDEE` property
- **THEN** it is served with `access.reason: "has_guests"`, a PATCH answers 422 `event_not_editable` and no invitation is sent

#### Scenario: Meeting organised by someone else
- **WHEN** an Outlook event's `isOrganizer` is false
- **THEN** it is served with `access.reason: "not_organizer"` and cannot be changed

#### Scenario: CalDAV event organised by someone else
- **WHEN** a CalDAV event without attendees has `ORGANIZER:mailto:boss@example.com` and the account's calendar addresses are `me@example.com`
- **THEN** it is served with `access.reason: "not_organizer"`, a PATCH or DELETE answers 422 `event_not_editable` and nothing is written

#### Scenario: CalDAV event organised by the account
- **WHEN** a CalDAV event without attendees has `ORGANIZER:mailto:ME@example.com` and the account's address is `me@example.com`
- **THEN** it is editable

#### Scenario: Subscribed calendar
- **WHEN** a user shows an ICS subscription
- **THEN** its events carry no `access` and cannot be dragged, renamed or deleted

#### Scenario: An event OpenTodo wrote
- **WHEN** a task's event is in the target calendar
- **THEN** it is not an event of this requirement: moving it in the calendar follows the task rules of `calendar-sync`, and OpenTodo shows the task, not an event

#### Scenario: Cache from before the upgrade
- **WHEN** a server has just upgraded and has not yet read a connected calendar again
- **THEN** its events are served with `access.reason: "refresh_pending"` and become editable after the next read of that calendar

### Requirement: The calendar is the source of truth
A change SHALL be conditional on the version of the event the user saw. The server SHALL answer 409 `event_changed` and write nothing when the `rev` sent is not the one it holds, or when the calendar refuses the write because the event changed (HTTP 412). A device that receives it SHALL restore the event as it was, refetch the visible range and tell the user the event changed in their calendar and the edit was not applied. When the calendar answers that the event no longer exists the server SHALL answer 404 `event_gone`, drop its cached copy and wake the user's devices. Neither side SHALL ever overwrite a version the user did not see, and no merge SHALL be attempted.

#### Scenario: Changed in another app
- **WHEN** the user moves an event in OpenTodo after the same event was moved in their phone's calendar app and OpenTodo has not read the calendar yet
- **THEN** the calendar refuses the write with a 412, the response is 409 `event_changed`, the block returns to the time the calendar holds and a toast says "changed in your calendar; your edit was not applied"

#### Scenario: Stale device
- **WHEN** a second device sends an edit for a `rev` the first device's edit has already replaced
- **THEN** the response is 409 `event_changed` without contacting the calendar and the second device shows the first device's result

#### Scenario: Deleted elsewhere
- **WHEN** the user renames an event that was deleted in the calendar app
- **THEN** the response is 404 `event_gone`, the event disappears from every device and a toast says so

#### Scenario: Unknown properties survive
- **WHEN** a CalDAV event has alarms, a `X-` property and a description and is moved in OpenTodo
- **THEN** the calendar's copy still has the alarms, the `X-` property and the description

### Requirement: Edits are queued offline and converge on the calendar
A device SHALL apply an edit to its local copy of the event at once and queue one command per event in a local outbox; later edits of the same event SHALL be merged into that command, a delete SHALL replace it, and an edit that returns the event to what it was SHALL remove it. A device SHALL send queued commands, one at a time and in order, when it is online, at start and when the calendar views refresh, and SHALL keep the user's pending edits visible when it refetches events. A delete SHALL wait 8 seconds before it is sent, so Undo can cancel it. An edit the server refuses (409, 404, 403, 422 or 400) SHALL be removed from the outbox, the event restored and the reason shown. A command that fails while the device is online (a 5xx, a 429, an unreachable calendar, or no answer) SHALL NOT be retried automatically: it SHALL stay in the outbox as a visible failed state with Retry and Discard. A command made while the device is offline SHALL wait, shown as pending, and SHALL be sent when the device is back online. Signing out SHALL delete the outbox. Devices SHALL converge on the calendar's state: after a refusal or a success every device reads the event from the server.

#### Scenario: Edit offline
- **WHEN** the device is offline and the user moves an event twice and renames it
- **THEN** one command holds the final time and title, the block shows the new time at once, and when the device comes online it sends one request

#### Scenario: Refetch keeps a pending edit
- **WHEN** the events cache is refreshed while a command is queued
- **THEN** the event is drawn with the queued change

#### Scenario: Two devices offline
- **WHEN** two devices move the same event offline and reconnect one after the other
- **THEN** the first one's edit is written, the second gets 409 `event_changed`, restores the event and shows the first one's time

#### Scenario: Refused edit
- **WHEN** a queued edit reaches the server after the user turned "Edit events in OpenTodo" off
- **THEN** the device drops the command, restores the event and shows that editing is off for the connection

#### Scenario: Sign out
- **WHEN** the user signs out with edits queued
- **THEN** the queue is deleted with the rest of the local data

#### Scenario: Move then move back
- **WHEN** the user moves an event and, before it is sent, moves it back
- **THEN** the command is removed and no request is made

### Requirement: Events are edited in Day and Week
In Day and Week the blocks of events whose `access.update` is true SHALL be movable to another time or day, resizable by their upper and lower edge and droppable on the all-day lane and the hours, with the existing pointer, touch long-press and edge-scroll behaviour of task blocks, and Escape SHALL cancel a drag. A drop SHALL write the change as in the first requirement, keep the event's own time zone, keep a floating event floating, and offer Undo, which restores the previous values with an inverse change. Event blocks SHALL NOT drop into a slot, SHALL NOT be completed, and SHALL NOT show drag affordances when they cannot be changed; a locked event SHALL say why in a tooltip and in its popover. The event popover SHALL let the user change the title, date and times and delete the event when allowed, without dragging, and SHALL show the same reasons when it cannot. A block with a queued change SHALL show it as saving. Month, Year, Plan and the all-day chips of other views SHALL stay read-only.

#### Scenario: Drag to a new time
- **WHEN** the user drags a 30-minute Google event from 09:00 to 14:00 in the Week
- **THEN** the block moves at once, a toast offers Undo, the calendar holds the event at 14:00 to 14:30 after the request, and the block ends in its final place with the id the server answered

#### Scenario: Resize
- **WHEN** the user drags the lower edge of an event from 10:00 to 11:00
- **THEN** the event ends at 11:00 and its start is unchanged

#### Scenario: Event in another zone
- **WHEN** a user in Lisbon drags an event kept in Europe/Berlin
- **THEN** the event is written in Europe/Berlin at the matching wall time, not converted to Lisbon time

#### Scenario: Locked event
- **WHEN** the user presses on a weekly event
- **THEN** no drag starts, the tooltip and the popover say repeating events are read-only for now, and a task block beside it can still be dragged

#### Scenario: Undo
- **WHEN** the user presses Undo on the toast after a move
- **THEN** the event is moved back with a second change and the calendar holds the original time

#### Scenario: Delete with Undo
- **WHEN** the user deletes an event and presses Undo within 8 seconds
- **THEN** no request is sent and the event reappears

#### Scenario: Delete not undone
- **WHEN** the user deletes an event and 8 seconds pass
- **THEN** the delete is sent, the toast ends, and the event is gone from the calendar

#### Scenario: Not in a slot
- **WHEN** the user drops an event on a calendar slot
- **THEN** the event is not added to the slot and lands on the grid under the pointer

### Requirement: Event edits have keyboard parity and a click alternative
Every pointer edit of an event SHALL have a keyboard equivalent and a one-click alternative that needs no dragging. An event that can be changed SHALL join the calendar's selection order, and the calendar's arrow keys SHALL move it by 15 minutes (Up, Down) and by a day (Left, Right), Shift+Up and Shift+Down SHALL move its end, Alt+Shift+Up and Alt+Shift+Down its start, and Delete or Backspace SHALL delete it, each with the toast and Undo of a drop. The popover's fields and Delete button SHALL be the one-click alternative, and the inventory of drags in `scripts/ux-audit/drag-alternatives.json` SHALL list it. Read-only events SHALL stay reachable with Tab for reading.

#### Scenario: Move with the arrows
- **WHEN** the user selects a changeable event with `j` and presses Down twice
- **THEN** the event is 30 minutes later, requested once after the keys settle as one change

#### Scenario: Delete key
- **WHEN** the user selects a changeable event and presses Delete
- **THEN** the event is hidden with a toast offering Undo and deleted after 8 seconds

#### Scenario: Keys ignore a locked event
- **WHEN** the user tabs onto a weekly event and presses Down
- **THEN** nothing changes

#### Scenario: Popover instead of dragging
- **WHEN** the user opens a changeable event and sets its start to 15:00 and presses Save
- **THEN** the event moves with the same request a drag makes

### Requirement: Agents and the command line can change events
The MCP server SHALL offer `list_calendar_events` and `update_calendar_event` and SHALL NOT offer any tool that deletes a calendar event. The read tool SHALL be offered to every token that may read; `update_calendar_event` only when the owner's `mcp.writes` switch and the user's switch are on and the caller uses an `agent` token, with the per-token write limits and the `agent.write` audit event, and it SHALL change an event only when the event's connection has both "Edit events in OpenTodo" and "Let assistants edit events" on, over the same rules as the routes. Tokens limited to chosen workspaces SHALL get `token_restricted` from both tools. The in-app assistant SHALL offer neither tool. Errors SHALL use the route's codes, and the titles the tools return SHALL be marked as untrusted text. `ot calendar events`, `ot calendar event edit` and `ot calendar event delete` SHALL call the routes with the user's token; the commands that change or delete events SHALL need a full token.

#### Scenario: Agent moves an event
- **WHEN** an agent token with writes allowed calls `update_calendar_event` with an event id, its `rev` and a new `start` and `end`, on a connection with both options on
- **THEN** the event moves in the calendar, the result holds the new event and says the change can be undone, and the audit log holds `agent.write` and `calendar_event.changed`

#### Scenario: No delete tool
- **WHEN** an agent lists the MCP tools, or calls `delete_calendar_event`
- **THEN** no tool that deletes a calendar event is listed, the call answers that the tool does not exist, and nothing is deleted

#### Scenario: Assistant edits off
- **WHEN** an agent calls `update_calendar_event` on a connection whose "Edit events in OpenTodo" is on and "Let assistants edit events" is off
- **THEN** the result is the error `assistant_edits_off`, the calendar is not contacted, and `list_calendar_events` serves the event with `access.update: false` and `reason: "assistant_edits_off"`

#### Scenario: Token limited to workspaces
- **WHEN** an agent token limited to chosen workspaces calls `list_calendar_events` or `update_calendar_event`
- **THEN** the result is the error `token_restricted` and the calendar is not contacted

#### Scenario: Writes disabled
- **WHEN** the owner's `mcp.writes` switch is off
- **THEN** `update_calendar_event` is not offered, and a direct call is refused with `writes_disabled_by_owner`

#### Scenario: Stale revision
- **WHEN** an agent sends a `rev` the event no longer has
- **THEN** the result is the error `event_changed` and nothing is written

#### Scenario: Command line
- **WHEN** a user runs `ot calendar event edit <id> --start 2026-11-12T14:00` with a full token
- **THEN** the event moves and the command prints the new time

#### Scenario: Read token
- **WHEN** a read token runs `ot calendar event delete <id>`
- **THEN** the command exits 1 with the 403 `forbidden` message and nothing is deleted

#### Scenario: Unauthenticated
- **WHEN** `ot calendar events` runs without a stored login
- **THEN** it exits 1 with the 401 `unauthorized` message

### Requirement: An assistant's event edit can be undone
When `update_calendar_event` changes an event, the server SHALL keep the values it replaced (the title, and the start, end and all-day flag together) with the version its write produced, for 30 days or until the event is changed again by the person, deleted or gone. The events route SHALL mark such an event with `changedBy: "assistant"` and the token's name, and its popover SHALL show who changed it with an Undo button. `POST /api/v1/calendar-sync/connections/{id}/events/{eventId}/undo`, from a signed-in session or a full token of the connection's owner, SHALL restore the kept values with the same conditional write as a `PATCH`, conditional on the version the assistant's write produced, and answer like a `PATCH`. It SHALL answer 409 `event_changed` with nothing written when the event changed since, 404 `not_found` when no undo is kept, and the route errors of the first requirement otherwise (including 401, 403 `forbidden`, 403 `token_restricted` and 403 `demo_restricted`). An undo SHALL be recorded as `calendar_event.changed` with the action `undone`. Undo SHALL NOT need "Let assistants edit events" to be on. The undo is server data: it SHALL NOT be an operation and SHALL NOT be in the export or a backup; devices learn its result from the events route.

#### Scenario: Undo an assistant's move
- **WHEN** an assistant moved an event from 09:00 to 11:00 and the user presses Undo in its popover
- **THEN** the calendar holds the event at 09:00 again, written with `If-Match` on the version the assistant's write produced, the popover no longer offers Undo, and the user's other devices show 09:00

#### Scenario: Changed since
- **WHEN** the event was moved again in the calendar app after the assistant's edit and the user presses Undo
- **THEN** the response is 409 `event_changed`, nothing is written and the device shows the event as the calendar holds it

#### Scenario: The person's own edit replaces the undo
- **WHEN** the user moves the event themselves after the assistant's edit
- **THEN** the event is no longer marked as changed by the assistant and an undo request answers 404 `not_found`

#### Scenario: Undo unauthenticated
- **WHEN** the undo route is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Undo with a limited token
- **WHEN** a read token, an agent token or a token limited to chosen workspaces requests the undo
- **THEN** the response is 403 (`forbidden` or `token_restricted`) and nothing is written
