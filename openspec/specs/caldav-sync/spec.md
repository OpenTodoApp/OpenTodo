# caldav-sync Specification

## Purpose
Defines the CalDAV endpoint through which calendar clients read and write a user's tasks as VTODO resources: how it is enabled, how clients authenticate, how projects appear as calendars, how properties map to task fields, and how writes, deletions, ETags and sync tokens relate to the operation log so that CalDAV clients converge with every other device.

## Requirements

### Requirement: Off by default, enabled by the owner
The CalDAV endpoint SHALL be disabled until the owner enables it in Settings or through the optional `OPENTODO_CALDAV=true` preset, which applies on first start only. While disabled, every path under `/dav/` and `/.well-known/caldav` SHALL answer 404, the host root SHALL answer WebDAV methods as the web app does (405 without DAV headers) and `/principals/` SHALL answer 404. Enabling or disabling SHALL take effect without a restart and SHALL be recorded as a server setting. Every signed-in user SHALL be able to read whether the endpoint is enabled and its address; only the owner SHALL change it.

#### Scenario: Disabled endpoint
- **WHEN** CalDAV is not enabled and a client requests `/dav/`
- **THEN** the response is 404 and no authentication is attempted

#### Scenario: Disabled root probe
- **WHEN** CalDAV is not enabled and a client sends `PROPFIND /` or `PROPFIND /principals/x/`
- **THEN** the root answers 405 without a `DAV` header and `/principals/x/` answers 404, so nothing reveals the endpoint

#### Scenario: Member cannot enable
- **WHEN** a member calls the route that changes the CalDAV setting
- **THEN** the response is a 403 `forbidden` error and the setting is unchanged

#### Scenario: Invalid setting
- **WHEN** the owner sends a CalDAV setting without a boolean `enabled`
- **THEN** the response is a 400 `invalid_input` error and the setting is unchanged

### Requirement: App passwords
A signed-in user SHALL be able to create, list (with creation, last-use and revocation times) and revoke named app passwords in Settings and via `GET`/`POST /api/v1/app-passwords`, `DELETE /api/v1/app-passwords/{id}`. Creating one SHALL require a recent sign-in like creating an API token. The secret SHALL be shown once and stored only as a hash. Creating and revoking SHALL be recorded in the audit log as `app_password.created` and `app_password.revoked`.

#### Scenario: Connect a calendar client
- **WHEN** a user creates an app password and configures a client with their email, that password and the server URL
- **THEN** the client discovers the user's calendars and the app password's last-use time is updated

#### Scenario: App password routes require a session or token
- **WHEN** `/api/v1/app-passwords` is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

### Requirement: CalDAV authentication
The CalDAV endpoint SHALL accept HTTP Basic authentication with the account email and an app password only; account passwords, session cookies and API tokens SHALL be refused there, and app passwords SHALL be refused by the REST API. Failures SHALL be rate limited per client address. Deactivating an account SHALL revoke its app passwords.

#### Scenario: Account password refused
- **WHEN** a client authenticates to `/dav/` with the account password instead of an app password
- **THEN** the response is 401 with a `WWW-Authenticate: Basic` challenge and nothing is revealed about the account

#### Scenario: Revoked app password
- **WHEN** a revoked app password is presented
- **THEN** the response is 401 and the attempt counts toward the rate limit

#### Scenario: Deactivated account
- **WHEN** the owner deactivates an account that uses a calendar client
- **THEN** the client's next request is answered 401

### Requirement: Discovery and calendar collections
The endpoint SHALL support discovery (`/.well-known/caldav`, current-user-principal, calendar-home-set) and SHALL expose one calendar collection per non-archived, non-deleted project the user can see in every workspace (their own and the shared projects they are a member of) plus one `Inbox` calendar per workspace, each reporting its display name, colour, that it supports only VTODO, the user's privileges, a CTag and a sync token. Outside the account's default workspace a calendar's display name SHALL be prefixed with the workspace name ("Work · Website", "Work · Inbox"); in the default workspace names are unchanged, so existing clients keep their calendars. The well-known redirect SHALL carry an absolute `Location`: `OPENTODO_BASE_URL` when configured, otherwise the origin the client asked for (the request's scheme and host, or a trusted proxy's `X-Forwarded-Proto` and `X-Forwarded-Host`). A `PROPFIND` on the host root SHALL redirect the same way to `/dav/`, an `OPTIONS` on the host root SHALL report the `DAV` capabilities, and `/principals/…` SHALL redirect to the same path under `/dav/`, so a client that probes the host root finds the principal. Calendars of shared projects SHALL be read-only for viewers. Another user's paths SHALL answer 404.

#### Scenario: List calendars
- **WHEN** an authenticated client performs discovery and lists the calendar home
- **THEN** it receives the Inbox calendar and one calendar per active project it can see, with name and colour, and none of other users' unshared projects

#### Scenario: Well-known redirect behind a proxy
- **WHEN** a client on a server without `OPENTODO_BASE_URL` sends `PROPFIND /.well-known/caldav` through a trusted proxy that forwards `X-Forwarded-Host: tasks.example.com` and `X-Forwarded-Proto: https`
- **THEN** the response is 301 with `Location: https://tasks.example.com/dav/`

#### Scenario: Apple client probes the root
- **WHEN** a client sends `OPTIONS /`, then `PROPFIND /` and `PROPFIND /principals/<user id>/`
- **THEN** the `OPTIONS` answers 200 with `DAV: 1, 3, calendar-access`, and each `PROPFIND` answers 301 with an absolute `Location` of `/dav/` and `/dav/principals/<user id>/` respectively

#### Scenario: Archived project hidden
- **WHEN** a project is archived in the app
- **THEN** the next calendar listing no longer includes it and clients that held it see it as removed

#### Scenario: Viewer is read-only
- **WHEN** a viewer of a shared project PUTs or DELETEs a resource in its calendar
- **THEN** the response is 403 and nothing changes

#### Scenario: Two workspaces
- **WHEN** a user with the default workspace "Personal" (projects Garden, Inbox) and the workspace "Work" (project Website) lists the calendar home
- **THEN** it holds "Garden", "Inbox", "Work · Website" and "Work · Inbox", and a VTODO created in "Work · Inbox" becomes a task in Work's Inbox

#### Scenario: Project moved between workspaces
- **WHEN** "Garden" is moved from Personal to Work
- **THEN** the next listing names its calendar "Work · Garden" at the same path with the same resources, and clients see a renamed calendar, not a removed one

### Requirement: Property mapping
Each task SHALL be one VTODO resource, by default `<task-id>.ics` with UID equal to the task id; a client-chosen resource name or a UID that is not a usable task id SHALL be kept. The mapping SHALL be: SUMMARY↔title, DESCRIPTION↔description, DUE and DTSTART↔due and deadline (see "Deadline mapping"), PRIORITY↔priority (1→1, 2→5, 3→9, 4→0; inbound 1–3→1, 4–6→2, 7–9→3, 0→4), STATUS/COMPLETED↔completed_at, CATEGORIES↔labels by name, RELATED-TO (parent)↔parent_id, CREATED↔created_at.

#### Scenario: Due date with time
- **WHEN** a task due `2026-10-11` at `09:30` and without a deadline is fetched
- **THEN** the VTODO carries `DUE:20261011T093000` with no time zone and no DTSTART, and a client in any time zone shows 09:30 on that date

#### Scenario: Priority round trip
- **WHEN** a client sets PRIORITY 5 on a task
- **THEN** the task has priority 2 in the app and is served back with PRIORITY 5

### Requirement: Due forms and recurrence
A task without a deadline SHALL be served with DUE = its due date: DATE for a due without time, floating DATE-TIME for a floating due with time, and DATE-TIME with TZID (served with a VTIMEZONE) for a zoned due. A due with a time SHALL also be served with DTSTART equal to DUE, so clients that schedule by DTSTART show it as scheduled; a due without time SHALL be served without DTSTART. Inbound, a VTODO with only DUE SHALL set the due date of a task without a deadline, and a VTODO with DTSTART and a duration (`ESTIMATED-DURATION` or `DURATION`) and no DUE SHALL set the due date from DTSTART (see "Inbound date shapes"). RRULE SHALL map to the task's recurrence rule where the recurrence grammar expresses it, and completing a recurring task through CalDAV SHALL behave as completing it in the app. A recurring task SHALL keep its due date when a client sends back the served DTSTART without the DUE.

#### Scenario: Due date with time
- **WHEN** a task due `2026-10-11` at `09:30` and without a deadline is fetched
- **THEN** the VTODO carries `DUE:20261011T093000` and `DTSTART:20261011T093000` with no time zone, and a client in any time zone shows 09:30 on that date

#### Scenario: Due date without time
- **WHEN** a task due `2026-10-11` without a time and without a deadline is fetched
- **THEN** the VTODO carries `DUE;VALUE=DATE:20261011` and no DTSTART

#### Scenario: Zoned due
- **WHEN** a client sends `DUE;TZID=Europe/Berlin:20261011T093000` and no DTSTART
- **THEN** the task's due is 09:30 on 2026-10-11 fixed to `Europe/Berlin`, it has no deadline, and it is served back with the same TZID and a VTIMEZONE

#### Scenario: Recurring task
- **WHEN** a client sends `RRULE:FREQ=WEEKLY` on a task and later marks it completed
- **THEN** the task's rule is `every week`, and the completion records an occurrence and moves the task to its next due date as in the app

#### Scenario: Recurring task moved by a client that writes no DUE
- **WHEN** a recurring task due 2026-10-13 at 09:00 was served with `DTSTART` = `DUE` and a client sends it back with `DTSTART:20261014T090000`, `ESTIMATED-DURATION:PT1H` and no `DUE`
- **THEN** the task is due 2026-10-14 at 09:00, keeps its rule, and every device shows the new date after sync; nothing is cleared

#### Scenario: Scheduled from an undated task
- **WHEN** a task with no dates is sent back by a client with `DTSTART:20261020T140000` and `ESTIMATED-DURATION:PT30M` and no `DUE`
- **THEN** the task is due 2026-10-20 at 14:00 with a 30-minute estimate, written as operations, and is served back with `DUE:20261020T140000`, `DTSTART:20261020T140000` and `ESTIMATED-DURATION:PT30M`

### Requirement: Deadline mapping
A task with a deadline SHALL be served with DUE = the deadline as a DATE and, when it has a due date, DTSTART = the due date in the forms above. Inbound, DTSTART and DUE that differ SHALL set the due date from DTSTART and the deadline from the date of DUE, except when the task has no deadline and the DUE is exactly its current due date, time and zone (the DUE this server served): then the client moved the task and the due date follows DTSTART with no deadline written. Equal DTSTART and DUE SHALL set the due date only. A DUE without DTSTART on a task that has a deadline SHALL set the deadline and clear the due date. A VTODO without DUE SHALL never clear the deadline: on a task that has one, DTSTART with a duration sets the due date and keeps the deadline, and a VTODO with neither DUE nor DTSTART keeps both dates as they are (see "Inbound date shapes").

#### Scenario: Deadline served
- **WHEN** a task due `2026-10-13` at `09:30` with the deadline `2026-10-17` is fetched
- **THEN** the VTODO carries `DTSTART:20261013T093000` and `DUE;VALUE=DATE:20261017`, and a calendar client shows it starting on the 13th and due on the 17th

#### Scenario: Deadline without a due date
- **WHEN** a task with no due date and the deadline `2026-10-17` is fetched
- **THEN** the VTODO carries `DUE;VALUE=DATE:20261017` and no DTSTART

#### Scenario: Start and due from a client
- **WHEN** a client PUTs a VTODO with `DTSTART;VALUE=DATE:20261013` and `DUE;VALUE=DATE:20261017`
- **THEN** the task is due 2026-10-13 with the deadline 2026-10-17, written as operations, and devices show both after their next sync

#### Scenario: Timed DUE with a start keeps the day
- **WHEN** a client PUTs `DTSTART:20261013T090000` and `DUE:20261017T170000`
- **THEN** the task is due 2026-10-13 at 09:00 with the deadline 2026-10-17, and the resource is served back with `DUE;VALUE=DATE:20261017`

#### Scenario: Timed task moved by a client that echoes the served DUE
- **WHEN** a task due 2026-10-22 at 14:00 without a deadline was served with `DTSTART` = `DUE` and a client sends it back with `DTSTART:20261023T100000`, `DUE:20261022T140000` and `ESTIMATED-DURATION:PT30M`
- **THEN** the task is due 2026-10-23 at 10:00 with a 30-minute estimate and still has no deadline

#### Scenario: Recurring task moved by a client that echoes the served DUE
- **WHEN** a recurring task due 2026-10-13 at 09:00 was served with `DTSTART` = `DUE` and a client sends it back with `DTSTART:20261014T090000`, `DUE:20261013T090000` and its `RRULE`
- **THEN** the task is due 2026-10-14 at 09:00, keeps its rule and has no deadline

#### Scenario: Due-date task scheduled by a client that echoes the served DUE
- **WHEN** a task due 2026-10-22 without a time and without a deadline is sent back with `DTSTART:20261021T150000` and `DUE;VALUE=DATE:20261022`
- **THEN** the task is due 2026-10-21 at 15:00 and has no deadline

#### Scenario: A changed DUE is a deadline
- **WHEN** a task due 2026-10-21 at 15:00 without a deadline is sent back with `DTSTART:20261021T150000` and `DUE;VALUE=DATE:20261031`
- **THEN** the task keeps its due date and gains the deadline 2026-10-31

#### Scenario: Recurring anchor unchanged
- **WHEN** a recurring task without a deadline is fetched
- **THEN** its DTSTART equals its DUE as before, and a client sending that pair back leaves the task without a deadline

#### Scenario: Deadline-only task edited in a client
- **WHEN** a task with the deadline `2026-11-20` and no due date is edited in a client that sends back only its `DUE;VALUE=DATE:20261120` with a new SUMMARY
- **THEN** the task keeps the deadline `2026-11-20`, has no due date and has the new title

#### Scenario: Deadline task moved by a client that writes no DUE
- **WHEN** a task due 2026-10-13 with the deadline 2026-10-17 was served with `DTSTART` and `DUE` and a client sends it back with `DTSTART;VALUE=DATE:20261015`, `ESTIMATED-DURATION:PT2H` and no `DUE`
- **THEN** the task is due 2026-10-15, keeps the deadline 2026-10-17, gains a 2-hour estimate, and is served back with `DTSTART;VALUE=DATE:20261015` and `DUE;VALUE=DATE:20261017`

### Requirement: Unmapped properties preserved
Properties not in the mapping, including X- properties, RRULEs the recurrence grammar cannot express, a DTSTART that sets nothing (see "Inbound date shapes") and alarms the alarm mapping cannot express, SHALL be stored in the task's `ical_extra` field and returned unchanged. A property the mapping consumes (ESTIMATED-DURATION, a mapped VALARM, a DTSTART equal to a DUE with a time, which this server serves itself) SHALL NOT also be stored there.

#### Scenario: Alarm survives a round trip
- **WHEN** a client adds a VALARM with `ACTION:AUDIO` and `REPEAT:3` (one the alarm mapping cannot express) to a task and another device later edits the title
- **THEN** the next fetch of the task still contains that VALARM unchanged and the new title, and the task has no reminder from it

#### Scenario: Served start echoed back
- **WHEN** a client sends back a timed task with the `DTSTART` equal to `DUE` it was served, and a device later moves the task to another time
- **THEN** the next fetch carries one `DTSTART`, equal to the new `DUE`

### Requirement: Writes become operations
A PUT that creates or changes a VTODO SHALL be applied as operations with server time and a device id `caldav:<app-password-id>`, one per property whose mapped value differs from the current value, and nothing SHALL be written outside the operation log. Devices receive the result on their next sync and are woken like after any REST write; offline devices apply it later under last-writer-wins.

#### Scenario: Create from a calendar client
- **WHEN** a client PUTs a new VTODO with a summary and a due date into a project calendar
- **THEN** a task with that id, title, due date and project exists, the response is 201 with an ETag, and other devices show the task after their next sync

#### Scenario: Concurrent edits of different fields converge
- **WHEN** a client changes a task's due date through CalDAV while a device changes its priority offline, and the device then syncs
- **THEN** the app, the device and the CalDAV client all end with the new due date and the new priority

#### Scenario: Invalid calendar data
- **WHEN** a PUT body is not parseable iCalendar or contains a VEVENT instead of a VTODO
- **THEN** the response is 415 or 403 with a precondition error element and no operation is written

### Requirement: Moves between calendars
Moving a resource between calendars SHALL change the task's `project_id`; a move into a calendar of another sharing scope SHALL create a copy there that keeps the client's UID and tombstone the original.

#### Scenario: Move into a shared project
- **WHEN** a member PUTs a task of their Inbox into the calendar of a shared project they may edit
- **THEN** a copy with the same UID exists in the shared project and the original is in the Trash

### Requirement: ETag, CTag and sync token
Each resource SHALL carry an ETag that changes whenever any of its mapped fields changes on any device; each calendar SHALL carry a CTag and a sync token that change whenever any of its resources changes, is added or is removed. A sync-collection report SHALL return resources changed since the given token and those removed since then (deleted, purged or moved away); a token the server cannot have issued SHALL be refused with `valid-sync-token`.

#### Scenario: Incremental sync
- **WHEN** a client sends a sync-collection report with the token from its last sync after two tasks changed and one was deleted
- **THEN** the report lists the two changed resources with new ETags and the deleted resource as removed, with a new token

### Requirement: Stale writes refused
A PUT with a stale `If-Match`, or with `If-None-Match: *` on an existing resource, SHALL be refused with 412 and SHALL write nothing.

#### Scenario: Stale write refused
- **WHEN** a client PUTs a VTODO with an `If-Match` ETag that no longer matches because a device edited the task
- **THEN** the response is 412, no field changes, and the client's subsequent GET returns the device's version with the new ETag

### Requirement: Deletion and completion through CalDAV
DELETE of a resource SHALL soft-delete the task through a tombstone operation; deleted tasks SHALL not be listed and SHALL answer 404 to GET. Setting STATUS to COMPLETED SHALL set `completed_at`, and clearing it SHALL reopen the task. Completed tasks SHALL remain listed in their calendar so clients can show history.

#### Scenario: Delete from a client
- **WHEN** a client deletes a task's resource
- **THEN** the response is 204, the task carries `deleted_at`, it disappears from every device after sync, and it is still present in the export

#### Scenario: Complete from a client while a device edits offline
- **WHEN** a client marks a task completed through CalDAV and a device that was offline reopens it later with a greater timestamp
- **THEN** after sync the task is open everywhere, because the later operation wins

### Requirement: Calendar management
MKCALENDAR SHALL create a project with the given display name and colour; PROPPATCH of display name or colour SHALL rename or recolour the project (admin or owner role); DELETE of a project calendar SHALL soft-delete the project and move its open tasks to the Inbox (owner role; as copies for a shared project); the Inbox calendar SHALL refuse deletion and renaming. All of these SHALL be recorded as operations.

#### Scenario: Create a list from a client
- **WHEN** a client creates a new calendar named "Garden"
- **THEN** a project "Garden" appears in the sidebar of every device after sync

#### Scenario: Inbox is protected
- **WHEN** a client attempts to delete or rename the Inbox calendar
- **THEN** the response is 403 and nothing changes

### Requirement: Resource names go with purged tasks
When a task is purged, by a single purge, as part of a purged project, by emptying the Trash or by the retention job, the server SHALL remove any resource name or UID a calendar app chose for it in the same transaction. A database upgraded from an earlier version SHALL lose names of tasks purged before. This is server state outside the op log; offline devices are unaffected and nothing needs to converge.

#### Scenario: Purge a task created by a calendar app
- **WHEN** a task that a calendar app created under its own resource name is deleted and then purged
- **THEN** no resource name for that task remains on the server

#### Scenario: Project purge cascades
- **WHEN** a trashed project whose tasks have client-chosen names is purged
- **THEN** the names of all its tasks are removed together with the tasks

#### Scenario: Retention
- **WHEN** the retention job purges an old trashed task with a client-chosen name
- **THEN** its name is removed in the same transaction

#### Scenario: Upgrade
- **WHEN** a server whose database holds names of already purged tasks starts on the new version
- **THEN** those names are removed and names of existing tasks are kept

### Requirement: Start and evening as calendar properties
A task's start SHALL be served as `X-OPENTODO-START`, with the value `SOMEDAY` or the date as `YYYYMMDD`, and an evening task SHALL carry `X-OPENTODO-EVENING:TRUE`; both SHALL be omitted when unset. A client that sends these properties SHALL set the fields, written as operations like every CalDAV write; an invalid value SHALL be ignored and kept in `ical_extra`. The two properties SHALL never be stored in `ical_extra` when mapped, and `DTSTART` SHALL keep its meaning from the deadlines mapping.

#### Scenario: Someday task served
- **WHEN** a parked task is fetched
- **THEN** the VTODO carries `X-OPENTODO-START:SOMEDAY`, no DUE and no DTSTART

#### Scenario: Deferred evening task from a client
- **WHEN** a client PUTs a VTODO with `X-OPENTODO-START:20261021` and `X-OPENTODO-EVENING:TRUE`
- **THEN** the task's start is `2026-10-21` and its evening flag is set, and devices show both after their next sync

#### Scenario: Unknown value preserved
- **WHEN** a client PUTs `X-OPENTODO-START:LATER`
- **THEN** the task's start is unchanged, the line is kept in `ical_extra`, and the response is 201 or 204 as for any accepted write

#### Scenario: Client without the properties
- **WHEN** a client that never sends X- properties edits the summary of a parked task
- **THEN** the task stays parked, because the properties were absent rather than removed and the write changes only the title

### Requirement: Dependency relations
A task's `blocked_by` SHALL be served as one `RELATED-TO;RELTYPE=DEPENDS-ON` line per blocker, carrying the blocker's UID. Inbound `DEPENDS-ON` relations whose UID resolves to a task of the same calendar scope SHALL become the task's `blocked_by` through the same write path as other properties; relations that do not resolve SHALL be preserved in `ical_extra` and served back unchanged. `RELATED-TO` without a type keeps meaning the parent.

#### Scenario: Blockers served
- **WHEN** a task blocked by two tasks of the same project is fetched
- **THEN** the VTODO carries two `RELATED-TO;RELTYPE=DEPENDS-ON` lines with those tasks' UIDs and its parent relation, if any, unchanged

#### Scenario: Blocker set from a calendar client
- **WHEN** a client PUTs a VTODO with `RELATED-TO;RELTYPE=DEPENDS-ON:<uid of a task in the same calendar>`
- **THEN** the task is blocked by that task in the app after the devices' next sync

#### Scenario: Unknown relation preserved
- **WHEN** a client sends a `DEPENDS-ON` relation whose UID matches no task the user can see
- **THEN** `blocked_by` is unchanged, the line is kept in `ical_extra`, and the next fetch returns it

### Requirement: CalDAV lookups do not scan the account
A CalDAV request SHALL load the user's view once and index it, so that finding a resource by name, a task by UID or a calendar's members does not scan every task. Responses SHALL stay the same. CalDAV writes still go through ops; nothing changes for offline devices or convergence.

#### Scenario: Multiget on a large account
- **WHEN** a client sends a calendar-multiget of 200 hrefs for an account of 2,000 tasks
- **THEN** each href costs a lookup, not a scan of the account, and the response lists the same resources and ETags as before

#### Scenario: Unauthenticated request
- **WHEN** a REPORT arrives without valid app-password credentials
- **THEN** the response is 401 and no view is loaded

### Requirement: Calendar queries encode each task once
A calendar-query SHALL encode each task once. For the plain filter that selects every task (VCALENDAR containing VTODO, no further conditions) it SHALL not parse the encoded data again; any other filter SHALL be evaluated on the calendar data the client would receive. The plain filter also returns a task whose calendar data would not parse back, as PROPFIND and sync-collection already do. The query only reads; devices are unaffected.

#### Scenario: Plain filter
- **WHEN** a client sends a calendar-query with only `comp-filter VCALENDAR` and `comp-filter VTODO`
- **THEN** every task of the calendar is returned without its data being parsed again

#### Scenario: Time-range query
- **WHEN** a client sends a calendar-query with a VTODO time-range
- **THEN** only the tasks whose calendar data falls in the range are returned, as before

### Requirement: Bounded calendar data parsing
The server SHALL parse iCalendar data in time proportional to its size. A logical content line SHALL be at most 64 KB after unfolding, and a body SHALL hold at most eight physical lines per allowed content line; a body over either limit SHALL be refused as invalid calendar data before any write, so nothing changes on the server and the client keeps its local copy to retry or fix. The limits apply to CalDAV resources and to subscribed calendars alike.

#### Scenario: Continuation-line flood
- **WHEN** a client `PUT`s a 1 MB VTODO body made of one property folded into hundreds of thousands of continuation lines
- **THEN** the server refuses it as invalid calendar data within a fraction of a second and no task changes

#### Scenario: Long description
- **WHEN** a client `PUT`s a VTODO whose folded `DESCRIPTION` is 60 KB long
- **THEN** it is accepted and the task's notes hold the whole description

#### Scenario: Over-long line
- **WHEN** a body holds one content line longer than 64 KB after unfolding
- **THEN** the server refuses it as invalid calendar data
