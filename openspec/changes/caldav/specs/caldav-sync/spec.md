# Spec Delta

## Purpose

Defines the CalDAV endpoint through which calendar clients read and write a user's tasks as VTODO resources: how it is enabled, how clients authenticate, how projects appear as calendars, how properties map to task fields, and how writes, deletions, ETags and sync tokens relate to the operation log so that CalDAV clients converge with every other device.

## ADDED Requirements

### Requirement: Off by default, enabled by the owner
The CalDAV endpoint SHALL be disabled until the owner enables it in Settings or through the optional `OPENTODO_CALDAV=true` preset. While disabled, every path under `/dav/` and `/.well-known/caldav` SHALL answer 404. Enabling or disabling SHALL take effect without a restart and SHALL be recorded as a server setting.

#### Scenario: Disabled endpoint
- **WHEN** CalDAV is not enabled and a client requests `/dav/`
- **THEN** the response is 404 and no authentication is attempted

#### Scenario: Member cannot enable
- **WHEN** a member calls the route that changes the CalDAV setting
- **THEN** the response is a 403 `forbidden` error and the setting is unchanged

### Requirement: App passwords
A signed-in user SHALL be able to create, list (with creation and last-use times) and revoke named app passwords in Settings and via `GET`/`POST /api/v1/app-passwords`, `DELETE /api/v1/app-passwords/{id}`. The secret SHALL be shown once and stored only as a hash. The CalDAV endpoint SHALL accept HTTP Basic authentication with the account email and an app password only; account passwords, session cookies and API tokens SHALL be refused there, and failures SHALL be rate limited.

#### Scenario: Connect a calendar client
- **WHEN** a user creates an app password and configures a client with their email, that password and the server URL
- **THEN** the client discovers the user's calendars and the app password's last-use time is updated

#### Scenario: Account password refused
- **WHEN** a client authenticates to `/dav/` with the account password instead of an app password
- **THEN** the response is 401 with a `WWW-Authenticate: Basic` challenge and nothing is revealed about the account

#### Scenario: App password routes require a session or token
- **WHEN** `/api/v1/app-passwords` is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Revoked app password
- **WHEN** a revoked app password is presented
- **THEN** the response is 401 and the attempt counts toward the rate limit

### Requirement: Discovery and calendar collections
The endpoint SHALL support discovery (`/.well-known/caldav`, current-user-principal, calendar-home-set) and SHALL expose one calendar collection per non-archived, non-deleted project plus an `Inbox` calendar, each reporting its display name, colour, that it supports only VTODO, a CTag and a sync token. Only the authenticated user's own projects SHALL be visible.

#### Scenario: List calendars
- **WHEN** an authenticated client performs discovery and lists the calendar home
- **THEN** it receives the Inbox calendar and one calendar per active project with name and colour, and none from other users

#### Scenario: Archived project hidden
- **WHEN** a project is archived in the app
- **THEN** the next calendar listing no longer includes it and clients that held it see it as removed

### Requirement: Property mapping
Each task SHALL be served as one VTODO resource `<task-id>.ics` with UID equal to the task id. The mapping SHALL be: SUMMARY↔title, DESCRIPTION↔description, DUE↔due (DATE without time, floating DATE-TIME with time), PRIORITY↔priority (1→1, 2→5, 3→9, 4→0; inbound 1–3→1, 4–6→2, 7–9→3, 0→4), STATUS/COMPLETED↔completed_at, CATEGORIES↔labels, RELATED-TO (parent)↔parent_id, CREATED↔created_at. Properties not in the mapping SHALL be stored in the task's `ical_extra` field and returned unchanged.

#### Scenario: Due date with time
- **WHEN** a task due `2026-10-11` at `09:30` is fetched
- **THEN** the VTODO carries `DUE:20261011T093000` with no time zone, and a client in any time zone shows 09:30 on that date

#### Scenario: Alarm survives a round trip
- **WHEN** a client adds a VALARM to a task and another device later edits the title
- **THEN** the next fetch of the task still contains the VALARM and the new title

#### Scenario: Priority round trip
- **WHEN** a client sets PRIORITY 5 on a task
- **THEN** the task has priority 2 in the app and is served back with PRIORITY 5

### Requirement: Writes become operations
A PUT that creates or changes a VTODO SHALL be applied as operations with server time and the device id `caldav`, one per property whose mapped value differs from the current value, and nothing SHALL be written outside the operation log. Moving a resource between calendars SHALL change `project_id`. Devices receive the result on their next sync; devices that are offline apply it later under the usual last-writer-wins rule.

#### Scenario: Create from a calendar client
- **WHEN** a client PUTs a new VTODO with a summary and a due date into a project calendar
- **THEN** a task with that id, title, due date and project exists, the response is 201 with an ETag, and other devices show the task after their next sync

#### Scenario: Concurrent edits of different fields converge
- **WHEN** a client changes a task's due date through CalDAV while a device changes its priority offline, and the device then syncs
- **THEN** the app, the device and the CalDAV client all end with the new due date and the new priority

#### Scenario: Invalid calendar data
- **WHEN** a PUT body is not parseable iCalendar or contains a VEVENT instead of a VTODO
- **THEN** the response is 415 or 403 with a precondition error element and no operation is written

### Requirement: ETag, CTag and sync token
Each resource SHALL carry an ETag that changes whenever any of its mapped fields changes on any device; each calendar SHALL carry a CTag and a sync token that change whenever any of its resources changes, is added or is removed. A PUT with a stale `If-Match`, or with `If-None-Match: *` on an existing resource, SHALL be refused with 412 and SHALL write nothing. A sync-collection report SHALL return resources changed since the given token and the ids of resources removed since then.

#### Scenario: Stale write refused
- **WHEN** a client PUTs a VTODO with an `If-Match` ETag that no longer matches because a device edited the task
- **THEN** the response is 412, no field changes, and the client's subsequent GET returns the device's version with the new ETag

#### Scenario: Incremental sync
- **WHEN** a client sends a sync-collection report with the token from its last sync after two tasks changed and one was deleted
- **THEN** the report lists the two changed resources with new ETags and the deleted resource as removed, with a new token

### Requirement: Deletion and completion through CalDAV
DELETE of a resource SHALL soft-delete the task through a tombstone operation; deleted tasks SHALL not be listed and SHALL answer 404 to GET. Setting STATUS to COMPLETED SHALL set `completed_at`, and clearing it SHALL reopen the task. Completed tasks SHALL remain listed in their calendar so clients can show history.

#### Scenario: Delete from a client
- **WHEN** a client deletes a task's resource
- **THEN** the response is 204, the task carries `deleted_at`, it disappears from every device after sync, and it is still present in the export

#### Scenario: Complete from a client while a device edits offline
- **WHEN** a client marks a task completed through CalDAV and a device that was offline reopens it later with a greater timestamp
- **THEN** after sync the task is open everywhere, because the later operation wins

### Requirement: Calendar management
MKCALENDAR SHALL create a project with the given display name and colour; PROPPATCH of display name or colour SHALL rename or recolour the project; DELETE of a project calendar SHALL soft-delete the project and move its open tasks to the Inbox; the Inbox calendar SHALL refuse deletion and renaming. All of these SHALL be recorded as operations.

#### Scenario: Create a list from a client
- **WHEN** a client creates a new calendar named "Garden"
- **THEN** a project "Garden" appears in the sidebar of every device after sync

#### Scenario: Inbox is protected
- **WHEN** a client attempts to delete or rename the Inbox calendar
- **THEN** the response is 403 and nothing changes
