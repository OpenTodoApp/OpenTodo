## ADDED Requirements

### Requirement: Workspace activity
Each workspace SHALL have an Activity page, opened from the workspace's menu (no new sidebar destination), at `/workspaces/<id>/activity`. It SHALL list the events of every project of the workspace the user can read, personal and shared, and of the workspace's Inbox, with every actor's changes including the user's own, newest first and grouped by day, in the layout of a project's activity view. It SHALL be filterable by a date range (from and to, both optional, inclusive days in the viewer's time zone), by several kinds at once (an event is listed when it has any chosen kind), by project and by actor. The filters SHALL be remembered on the device for that workspace and restored when the page opens again. The page SHALL show the locally retained events offline and SHALL load the rest from the server when online, without duplicates. Opening it SHALL not mark anything seen and SHALL not change any unread count.

#### Scenario: A week's retrospective
- **WHEN** the workspace Work has the personal project Planning and the shared project Website, and the user sets the range 10–16 November and the kinds Completed and Commented
- **THEN** the page lists every completion and comment in both projects in that week, by the user and by others, newest first

#### Scenario: Several kinds at once
- **WHEN** the user chooses Commented, Completed, Rescheduled and Time tracked
- **THEN** an event of any of the four kinds is listed, and events of other kinds are not

#### Scenario: Remembered on the device
- **WHEN** the user chose a range and two kinds, closes the app and opens the page again on the same device
- **THEN** the same range and kinds are applied, and another device opens with its own choice

#### Scenario: Offline
- **WHEN** the device is offline and the user opens the page
- **THEN** the locally retained events of the workspace are listed with the filters applied, and no error is shown

### Requirement: Time tracking in activity
Creating a time entry, and ending a running one, SHALL be an activity event of kind `time_tracked` on the entry's task, naming the actor and the minutes tracked (rounded to whole minutes), derived alike on the server and on the device and pinned by the shared activity fixture. Editing or deleting an entry SHALL be an event of kind `time_changed`. Neither SHALL name the entry's note, so an encrypted note never reaches an event. Both SHALL belong to the feed category `time`.

#### Scenario: Timer stopped
- **WHEN** Bob stops a timer on "Fix the login page" after 42 minutes in a shared project
- **THEN** the task's and the project's activity list "Bob tracked 42 min", and the workspace Activity lists it under Time tracked

### Requirement: Workspace activity route
`GET /api/v1/workspaces/{id}/activity` SHALL return the events of every project of that workspace and of its Inbox in scopes the caller belongs to, newest first, with the same cursor pagination as the other activity routes and the optional filters `from` and `to` (Unix ms, inclusive), `kind` (one or more feed categories, comma-separated, any of them), `project` (one or more project ids, comma-separated) and `actor`. It SHALL require authentication, SHALL answer 404 for a workspace the caller does not belong to, and SHALL never include an event from a scope the caller does not belong to, whatever the filters. Pages SHALL read only what they need, as the feed route does.

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches the route
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Another person's workspace
- **WHEN** Alice requests the activity of a workspace she does not belong to
- **THEN** the response is a 404 `not_found` error that does not reveal it

#### Scenario: Invalid filter
- **WHEN** the request carries `kind=finished` or `from` after `to`
- **THEN** the response is a 400 `invalid_input` error naming the field
