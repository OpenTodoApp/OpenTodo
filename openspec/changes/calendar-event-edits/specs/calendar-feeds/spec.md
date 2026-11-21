## MODIFIED Requirements

### Requirement: Events served to devices
`GET /api/v1/calendar-feeds/events?from=YYYY-MM-DD&to=YYYY-MM-DD` SHALL return the caller's occurrences that overlap the range, at most 92 days wide, with start and end as `{date, time?, tz?}` values like a due, the subscription id and when the subscription was last refreshed. For an event of a connected calendar it SHALL also return `rev`, an opaque string that changes whenever the event's remote version does, and `access`, `{update, delete, reason?}`, which says whether OpenTodo may change or delete the event and, when it may not, why; the subscription of such an event SHALL carry `connectionId`, `calendarUrl`, `caps` and `editEvents`. Events of subscribed (ICS) calendars SHALL carry neither `rev` nor `access`. The route SHALL answer 400 `invalid_input` for a malformed or wider range.

#### Scenario: Week of events
- **WHEN** a device requests `from=2026-10-12&to=2026-10-18`
- **THEN** the response lists every occurrence of the user's enabled subscriptions that overlaps those days, including all-day and multi-day ones, and nothing from disabled subscriptions or other users

#### Scenario: Range too wide
- **WHEN** a device requests a range of 100 days
- **THEN** the response is a 400 `invalid_input` error naming `to`

#### Scenario: Unauthenticated
- **WHEN** the events route is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Editable event of a connected calendar
- **WHEN** a connection with "Edit events in OpenTodo" on shows a writable calendar holding a single event without guests
- **THEN** the event is served with a `rev` and `access: {"update": true, "delete": true}`

#### Scenario: Locked event says why
- **WHEN** the same calendar holds a weekly event
- **THEN** that event is served with `access: {"update": false, "delete": false, "reason": "recurring"}`

#### Scenario: Subscribed calendar event
- **WHEN** the response holds an event of an ICS subscription
- **THEN** it has no `rev` and no `access`

### Requirement: Events are read-only and can be hidden
Event blocks, chips, rows and marks of subscribed (ICS) calendars SHALL NOT be movable, resizable, completable or drop targets. The same holds for events of connected calendars unless their `access.update` or `access.delete` is true (see `calendar-event-edits`); no event SHALL be completable, and Month and Year rows and marks SHALL stay read-only. Blocks, chips and rows SHALL be reachable with the keyboard for reading. A per-device toolbar toggle, shown in Day, Week, Plan, Month and Year while the user has a calendar, SHALL hide and show them in all of these views, kept across reloads and never synced.

#### Scenario: Only the task moves
- **WHEN** the user drags on an event block of a subscribed calendar
- **THEN** nothing is written and the block stays where it is, while a task block next to it can still be dragged

#### Scenario: Connected calendar with edits off
- **WHEN** the user drags an event of a connected calendar whose connection has "Edit events in OpenTodo" off
- **THEN** nothing is written and the event's popover says editing events is off for this connection

#### Scenario: Keyboard
- **WHEN** the user tabs onto an event block and presses Enter
- **THEN** a popover shows the summary, time, location and calendar name, and Escape closes it; for an event that cannot be edited no key moves or edits it

#### Scenario: Hide calendars on this device
- **WHEN** the user turns the toolbar's "Calendars" toggle off
- **THEN** event blocks and chips disappear on this device only, the toggle state survives a reload, and other devices are unaffected

#### Scenario: Hidden in the Month and the Year
- **WHEN** the user turns "Calendars" off in the Month
- **THEN** the Month's event rows and the Year's event marks disappear on this device, and turning it on in either view shows them again in both

#### Scenario: Month stays read-only
- **WHEN** the user drags an event row in the Month
- **THEN** nothing is written, whatever the event's `access`
