## MODIFIED Requirements

### Requirement: Discovery and calendar collections
The endpoint SHALL support discovery (`/.well-known/caldav`, current-user-principal, calendar-home-set) and SHALL expose one calendar collection per non-archived, non-deleted project the user can see in every workspace (their own and the shared projects they are a member of) plus one `Inbox` calendar per workspace, each reporting its display name, colour, that it supports only VTODO, the user's privileges, a CTag and a sync token. Outside the account's default workspace a calendar's display name SHALL be prefixed with the workspace name ("Work · Website", "Work · Inbox"); in the default workspace names are unchanged, so existing clients keep their calendars. Calendars of shared projects SHALL be read-only for viewers. Another user's paths SHALL answer 404.

#### Scenario: List calendars
- **WHEN** an authenticated client performs discovery and lists the calendar home
- **THEN** it receives the Inbox calendar and one calendar per active project it can see, with name and colour, and none of other users' unshared projects

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
