# Spec Delta

## ADDED Requirements

### Requirement: Connection scope
Each connection SHALL have a scope: `all` (the default, and the meaning of every connection created before scopes), `only` the chosen workspaces, projects and Inboxes, or everything `except` them. A workspace SHALL cover its projects and its Inbox, a project its sub-projects, an Inbox the tasks without a project of that workspace. The user SHALL set it in the connection's Calendars dialog (**Tasks from**: All, Only these, All except these) and through `PATCH /api/v1/calendar-sync/connections/{id}` with `scope`; every connection answer SHALL carry it. A scope SHALL hold at most 200 ids of at most 64 characters; anything else SHALL be refused with 400 `invalid_input` (field `scope`) and nothing SHALL change. A scope with nothing chosen SHALL be stored as `all`. The scope is server configuration of the connection: never an operation, never synced or exported, so it changes only while online; it never changes a task.

Only the tasks of the task feed's selection that are in the scope SHALL be written as events. A new scope SHALL make the connection due at once; the next cycles SHALL remove the events the connection wrote for tasks that left the scope, and SHALL never remove or change an event the connection did not write. Changes and deletions of an event whose task is outside the scope SHALL not be applied to the task. A scope change SHALL be recorded in `calendar_connection.updated` with `scope` among the changed settings.

#### Scenario: One calendar per workspace
- **WHEN** a user with the workspaces Personal and Work sets a connection's scope to `{"mode":"only","workspaces":["<work id>"]}`
- **THEN** the next cycle writes the dated tasks of Work's projects and Work's Inbox, and none of Personal's

#### Scenario: Scope narrowed
- **WHEN** the scope of a connection that wrote events for the projects Garden and Website becomes "All except Garden", and the target calendar also holds the user's own event "Dentist"
- **THEN** the next cycle removes the event of Garden's task, keeps Website's and "Dentist", and Garden's task keeps its date

#### Scenario: Event of a task outside the scope moved
- **WHEN** the user moves in the calendar the event of a task that left the scope before the cycle removed it
- **THEN** the task's due date and title do not change and the event is removed

#### Scenario: Invalid scope
- **WHEN** a user PATCHes a connection with `{"scope":{"mode":"some"}}`
- **THEN** the response is a 400 `invalid_input` error and the connection is unchanged

#### Scenario: Unauthenticated
- **WHEN** `PATCH /api/v1/calendar-sync/connections/{id}` with a scope is sent without credentials
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Existing connections
- **WHEN** a server with connections from before scopes upgrades
- **THEN** every connection reports `{"mode":"all"}` and writes the same tasks as before
