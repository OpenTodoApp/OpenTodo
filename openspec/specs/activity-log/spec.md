# activity-log Specification

## Purpose
Turns the operation log into a readable history of who changed what and when, per task and per project, available on every device including offline.

## Requirements

### Requirement: Attributed operations
Every operation served to a device SHALL carry the account id of its author, stamped by the server from the authenticated submitter; a value supplied by a client SHALL be ignored. Operations written through the API SHALL be attributed to the token's account. This field is additive and devices that do not understand it SHALL keep syncing unchanged.

#### Scenario: Member's edit is attributed
- **WHEN** Bob changes a task title and Alice's device pulls the operation
- **THEN** the operation names Bob's account as its author

#### Scenario: Client cannot forge the author
- **WHEN** a device submits an operation claiming another account as author
- **THEN** the stored and served author is the submitting account

### Requirement: Activity events derived from operations
The activity log SHALL be derived only from the operation log; no separate event is written for a data change. Each operation SHALL map to an event naming the actor, the entity, the field changed, the old and new values when known, and the time, with consecutive operations by the same actor on the same entity within a short window folded into one event. Derivation SHALL give the same result on the server and on a device holding the same operations.

#### Scenario: Create folded into one event
- **WHEN** a task is created, which produces one operation per field
- **THEN** the activity shows a single "created the task" event by the actor, not one per field

#### Scenario: Meaningful field changes
- **WHEN** a task is completed, rescheduled, reassigned, moved to another project or commented on
- **THEN** each appears as a distinct event wording the change, such as "completed", "moved the due date to 2026-10-12", "assigned to Bob", "commented"

### Requirement: Per-task activity
The task detail panel SHALL show the task's activity in its Activity tab in reverse chronological order, with comment events as compact one-line entries, built from the operations already in local storage so it is available offline, and extended with older history from the server when online and more exists.

#### Scenario: Offline history
- **WHEN** the user opens a task's detail panel without a network
- **THEN** the activity list shows every event derived from operations the device has received, including the user's own unsent changes marked as pending

#### Scenario: Older history on demand
- **WHEN** the user asks for more at the end of the list while online
- **THEN** older events are fetched from the server and appended without duplicates

#### Scenario: Comment events are compact
- **WHEN** Bob commented on the task an hour ago
- **THEN** the Activity tab shows one line "Bob commented" with its time, and choosing it opens the Comments tab at that comment

### Requirement: Per-project activity
Each project SHALL have an activity view listing events across its tasks and the project itself, newest first, filterable by actor and by event kind. For shared projects it SHALL include every member's changes; for personal projects it SHALL cover the user's own devices and API writes.

#### Scenario: Shared project activity
- **WHEN** three members change tasks in a shared project and Alice opens its activity view
- **THEN** she sees all three members' events with names and times, newest first

#### Scenario: Filter by actor
- **WHEN** Alice filters the view to Bob
- **THEN** only Bob's events are listed and the filter is reachable with the keyboard

### Requirement: Activity routes
`GET /api/v1/tasks/{id}/activity` and `GET /api/v1/projects/{id}/activity` SHALL return events newest first with cursor pagination, derived from operations in scopes the caller is a member of. Both SHALL require authentication and SHALL return 404 for entities outside the caller's scopes.

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches an activity route
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Project outside the caller's scopes
- **WHEN** an authenticated user requests the activity of a project they cannot read
- **THEN** the response is a 404 `not_found` error that does not reveal the project's existence

#### Scenario: Pagination
- **WHEN** a project has more events than one page
- **THEN** the response includes a cursor and the next request with that cursor returns the following page with no overlap

### Requirement: Local activity retention
A device SHALL keep derived events for recent history locally with a bounded size per project, dropping the oldest first, so offline storage stays small; the server SHALL keep the full history for as long as the operation log exists. Retention never affects convergence because events are derived, not synced.

#### Scenario: Bounded local storage
- **WHEN** a project accumulates more events than the local bound
- **THEN** the oldest local events are discarded and the server still serves them on request

### Requirement: Grouped activity runs
Consecutive events by the same actor on the same task within ten minutes of each other SHALL be shown as one run summarising what changed ("You changed the due date and priority"), expandable to the individual events with their values. Each run and event SHALL show the actor's avatar initials, an icon for the kind of change, and a relative time with the absolute time in the user's format on hover and focus. Grouping SHALL be presentation only and SHALL NOT change the events.

#### Scenario: Burst of edits
- **WHEN** the user changed a task's title, due date and priority within two minutes
- **THEN** the Activity tab shows one run "You renamed the task and changed the due date and priority" that expands to three events

#### Scenario: Different actors are not merged
- **WHEN** Alice changes the due date and Bob changes the priority a minute later
- **THEN** two separate entries are shown

#### Scenario: Pending inside a run
- **WHEN** one of the events in a run comes from an unsent local change
- **THEN** the run is marked pending until the change is acknowledged by the server

### Requirement: Dependency events
A change of a task's `blocked_by` SHALL be an event of kind `dependencies`, carrying the old and new lists, derived identically on the server and on the device and folded with the actor's other operations on the task within the usual window. It SHALL be classified after completion, deletion, due, assignee and project changes, so a batch that also moves the task is still a "moved" event.

#### Scenario: Blockers added
- **WHEN** Alice makes "Book flights" blocked by "Confirm dates"
- **THEN** the task's activity shows one `dependencies` event by Alice from an empty list to `["<id of Confirm dates>"]`, offline as well as from the server

#### Scenario: Same derivation on both sides
- **WHEN** the shared fixture holds a batch that sets `blocked_by` and the title within the window
- **THEN** the server and the device both derive a single `dependencies` event listing both changes
