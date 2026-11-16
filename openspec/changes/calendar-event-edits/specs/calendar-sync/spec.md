## ADDED Requirements

### Requirement: Edit events option
A connection SHALL have a setting `edit_events`, off by default and for every connection created before it, which lets the user change and delete the events of its calendars from OpenTodo. `PATCH /api/v1/calendar-sync/connections/{id}` SHALL accept `{"edit_events": true|false}` from a signed-in session or full token of the connection's owner, record it in the audit log as a connection update, and the connection view SHALL report it. Turning it on SHALL NOT change any event, SHALL NOT ask for a new permission and SHALL NOT make the connection sync sooner or later. Turning it off SHALL stop every event write of the connection at once, while writes already queued on devices are refused with `403 event_edits_off`. Deleting the connection SHALL delete the setting. The setting SHALL NOT affect how tasks are written to the target calendar.

#### Scenario: Default
- **WHEN** a user connects an account, or a server with connections from before this setting upgrades
- **THEN** every connection reports `edit_events: false` and no event of any calendar can be changed from OpenTodo

#### Scenario: Turn it on
- **WHEN** the user PATCHes `{"edit_events": true}` on their connection
- **THEN** the response reports `edit_events: true`, the audit log holds a `calendar_connection.updated` event naming `edit_events`, and the events route serves `access.update: true` for the plain events of its writable calendars

#### Scenario: Turn it off with edits queued
- **WHEN** the user turns it off while a device holds a queued edit for one of its events
- **THEN** that edit is refused with `403 event_edits_off` when the device sends it, the device restores the event and says editing is off

#### Scenario: Another user's connection
- **WHEN** a user PATCHes `edit_events` on a connection id of a different account
- **THEN** the response is a 404 `not_found` error

#### Scenario: Unauthenticated
- **WHEN** the PATCH is sent without credentials
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Invalid value
- **WHEN** a user PATCHes `{"edit_events": "yes"}`
- **THEN** the response is a 400 `invalid_input` error and the connection is unchanged

### Requirement: Calendar capabilities
Each calendar of a connection SHALL report `caps`, `{create, update, delete}`, derived from the permissions the account grants on that calendar: for a CalDAV or Google calendar its `current-user-privilege-set` (`bind` for create, `write-content` for update, `unbind` for delete, `write` or `all` for all three), for a Microsoft calendar its `canEdit` for all three. A calendar saved before capabilities existed SHALL be reported with all three equal to the opposite of `read_only` until it is discovered again. A calendar whose account refuses a write with 403 SHALL be reported with all three false until the next discovery. Capabilities SHALL be served in `GET /api/v1/calendar-sync/connections` and, for shown calendars, on the managed subscriptions of the events route.

#### Scenario: Read-only calendar
- **WHEN** a Google account shares a calendar with the user as "see all event details"
- **THEN** the calendar is reported with `caps` all false and none of its events is editable from OpenTodo

#### Scenario: Delete forbidden
- **WHEN** a CalDAV calendar's privilege set holds `write-content` and `bind` but not `unbind`
- **THEN** its caps are `{create: true, update: true, delete: false}`, its events can be moved and renamed but not deleted, and the popover has no Delete

#### Scenario: Calendar saved before capabilities
- **WHEN** a server upgrades and a calendar has `read_only: false` and no caps
- **THEN** it is reported as `{create: true, update: true, delete: true}` until its next discovery

#### Scenario: The server says no
- **WHEN** the remote answers 403 to a write on a calendar reported writable
- **THEN** the write fails with `403 calendar_read_only`, the calendar's caps become all false and its events stop being draggable on the next refresh
