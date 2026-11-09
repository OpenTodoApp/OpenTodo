# Spec Delta

## ADDED Requirements

### Requirement: App password scope
Each app password SHALL have a scope with the same shape and limits as a calendar sync connection's: `all` (the default, and the meaning of every app password created before scopes), `only` the chosen workspaces, projects and Inboxes, or everything `except` them. It SHALL be set when the password is created (`POST /api/v1/app-passwords` with an optional `scope`, and **Lists** in the New app password dialog) and changed with `PATCH /api/v1/app-passwords/{id}` (**Lists** in the password's menu), which SHALL need a recently confirmed session or an admin token like creation, SHALL be refused on the public demo, and SHALL take effect on the password's next request. `GET /api/v1/app-passwords` SHALL list it. A refused scope SHALL answer 400 `invalid_input`; a foreign, unknown or revoked password 404 `not_found`. The scope is server configuration, never an operation.

Under a scope, the endpoint SHALL behave as if the account had only the calendars in it: the calendar home SHALL list only them; any request on another calendar or its resources SHALL answer as for a calendar that does not exist (404; a PUT 409), so nothing outside the scope is read, changed, created or deleted. A VTODO whose UID names a task outside the scope SHALL create a new task in the calendar it is put into and SHALL never move or change the other task. Parents and blockers outside the scope SHALL not be served and SHALL be kept when the client writes the task. A task created through CalDAV lands in the calendar it was put into, which is inside the scope. MKCALENDAR SHALL create the project in the first chosen workspace of an `only` scope that chooses workspaces, otherwise in the default workspace, and SHALL be refused with 403 when the new project would be outside the scope.

A `sync-collection` report with a token SHALL report as removed (404) every task that is no longer in the calendar because its project, its workspace or its parent changed, so a task moved to a calendar outside the scope, or between workspace Inboxes, disappears from the client. A calendar that leaves the scope SHALL disappear from the home listing and answer 404.

#### Scenario: A phone for work
- **WHEN** a user with the workspaces Personal (project Garden) and Work (project Website) creates an app password with `{"mode":"only","workspaces":["<work id>"]}` and lists the calendar home with it
- **THEN** the listing holds "Work · Website" and "Work · Inbox" and neither "Garden" nor Personal's Inbox, and a PROPFIND, GET or DELETE on Garden answers 404 and a PUT into it 409

#### Scenario: Hidden task's UID
- **WHEN** that client PUTs into Website a VTODO whose UID is the id of a task in Garden
- **THEN** a new task is created in Website and the Garden task is unchanged

#### Scenario: Task moved out of the scope
- **WHEN** a task of Work's Inbox is moved to Garden in the app and the client sends `sync-collection` with its last token for Work's Inbox
- **THEN** the report lists the task's resource with status 404

#### Scenario: New list from the client
- **WHEN** that client sends MKCALENDAR for a new list
- **THEN** a project is created in Work and appears in the listing

#### Scenario: Scope changed
- **WHEN** the user changes the password's scope to "All except Website"
- **THEN** the next listing holds Garden and both Inboxes, and requests on Website answer 404

#### Scenario: Invalid scope
- **WHEN** a user PATCHes an app password with a scope of mode `some`
- **THEN** the response is a 400 `invalid_input` error and the scope is unchanged

#### Scenario: Unauthenticated
- **WHEN** `PATCH /api/v1/app-passwords/{id}` is sent without credentials
- **THEN** the response is a 401 `unauthorized` error
