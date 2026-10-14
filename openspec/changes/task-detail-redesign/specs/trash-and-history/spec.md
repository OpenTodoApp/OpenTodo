## MODIFIED Requirements

### Requirement: Revision history
The API SHALL expose `GET /api/v1/tasks/{id}/history` and `GET /api/v1/projects/{id}/history`, requiring authentication, returning the entity's operations ordered by timestamp with field, value, timestamp and device, including operations that lost under last-writer-wins. The client SHALL show this as a list of versions in the History tab of the detail panel, newest first; when offline it SHALL state that history needs a connection and show nothing stale.

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

### Requirement: Restore a previous value
From the history timeline the user SHALL be able to restore an earlier value of a field, which SHALL be written as a new operation with the current time, so it applies locally at once, is itself recorded in the history, and converges like any other edit. Restoring a value SHALL never remove operations from the log. The user SHALL also be able to restore a whole version, which SHALL write one such operation for each restorable field the version changed, after one confirmation listing those fields.

#### Scenario: Restore an old title
- **WHEN** the user picks the previous title in the history and confirms
- **THEN** the task shows the old title again and the history gains a new entry for this restore

#### Scenario: Restore a version
- **WHEN** the user restores a version that changed the title and the due date, and confirms the dialog naming both fields
- **THEN** the task shows that version's title and due date, and the history gains one new version containing both restores

#### Scenario: Version restore converges
- **WHEN** the user restores a version on one device while another device edits the title offline, and both sync
- **THEN** both devices end with the title written with the greater timestamp, and the restored due date is kept

## ADDED Requirements

### Requirement: Readable versions
Each version SHALL group the change sets of one author and device made within five minutes of each other, and SHALL show the author's avatar initials or the device label, a relative time with the absolute time in the user's format on hover and focus, and a one-line human summary of what changed.

#### Scenario: Summary line
- **WHEN** a version renamed a task and moved its due date
- **THEN** the collapsed version reads "Renamed and rescheduled" with the author and time

#### Scenario: Bursts are grouped
- **WHEN** the same user on the same phone changed the title and, two minutes later, the priority
- **THEN** the History tab shows one version containing both changes

### Requirement: Readable field changes
Expanding a version SHALL show each field change with the old value struck through and the new value emphasised, formatted the way the panel shows them for due dates, priorities, labels, projects, sections, parents and assignees. Changes that lost under last-writer-wins SHALL be marked "not applied" and remain restorable.

#### Scenario: Readable values
- **WHEN** the user expands a version that changed priority from 4 to 1 and the project from Inbox to "Work"
- **THEN** the changes read "Priority P4 → P1" and "Project Inbox → Work", not raw numbers or ids

#### Scenario: Lost change
- **WHEN** a version contains a change that lost under last-writer-wins
- **THEN** that change is shown muted with the label "not applied" and still offers "Restore this value", so the lost value can be recovered
