## MODIFIED Requirements

### Requirement: Revision history
The API SHALL expose `GET /api/v1/tasks/{id}/history` and `GET /api/v1/projects/{id}/history`, requiring authentication, returning the entity's operations ordered by timestamp with field, value, timestamp and device, including operations that lost under last-writer-wins, except the superseded note versions that compaction removed (OpenSpec `op-log-compaction`): for edits received more than 30 days ago the note keeps one revision per calendar day in UTC. The client SHALL show this as a list of versions in the History tab of the detail panel, newest first, and above the first note revision older than 30 days it SHALL say in one muted line that older note versions are kept one per day (UTC); when offline it SHALL state that history needs a connection and show nothing stale.

#### Scenario: Timeline of changes
- **WHEN** a task was created on a laptop, retitled on a phone and rescheduled through the API, and the user opens its history online
- **THEN** three groups of changes are listed in time order with device labels "laptop", "phone" and "API" and the old and new values

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials asks for a task's history
- **THEN** the response is 401 `unauthorized`

#### Scenario: Unknown or foreign entity
- **WHEN** an authenticated user asks for the history of an id that does not exist for their account
- **THEN** the response is 404 `not_found`

#### Scenario: Offline history tab
- **WHEN** the user opens the History tab without a network
- **THEN** the tab states that history needs a connection to the server and lists no versions

#### Scenario: Thinned note history
- **WHEN** a task's note was edited 40 times on 2 September and 5 times yesterday, compaction ran, and the user opens the task's history
- **THEN** 2 September shows one note revision, the line saying older note versions are kept one per day (UTC) is shown once above the older revisions, and yesterday shows all 5
