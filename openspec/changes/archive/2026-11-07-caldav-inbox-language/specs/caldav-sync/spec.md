## MODIFIED Requirements

### Requirement: Discovery and calendar collections
The endpoint SHALL support discovery (`/.well-known/caldav`, current-user-principal, calendar-home-set) and SHALL expose one calendar collection per non-archived, non-deleted project the user can see in every workspace (their own and the shared projects they are a member of) plus one `Inbox` calendar per workspace, each reporting its display name, colour, that it supports only VTODO, the user's privileges, a CTag and a sync token. A project calendar's display name SHALL be the project's name. The Inbox calendar's display name SHALL be the word the app shows for Inbox in the user's language: the language chosen in Settings (`user_prefs.language`), else the first shipped language of the request's `Accept-Language`, else English ("Eingang" in German); a change of language SHALL rename the list at the next listing, at the same path. The Inbox SHALL still not be renamed by a client. Outside the account's default workspace a calendar's display name SHALL be prefixed with the workspace name ("Work · Website", "Work · Inbox"); in the default workspace names are unchanged, so existing clients keep their calendars. The well-known redirect SHALL carry an absolute `Location`: `OPENTODO_BASE_URL` when configured, otherwise the origin the client asked for (the request's scheme and host, or a trusted proxy's `X-Forwarded-Proto` and `X-Forwarded-Host`). A `PROPFIND` on the host root SHALL redirect the same way to `/dav/`, an `OPTIONS` on the host root SHALL report the `DAV` capabilities, and `/principals/…` SHALL redirect to the same path under `/dav/`, so a client that probes the host root finds the principal. Calendars of shared projects SHALL be read-only for viewers. Another user's paths SHALL answer 404.

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

#### Scenario: Inbox in the user's language
- **WHEN** a user whose language in Settings is German, with the workspace "Work", lists the calendar home from a client that sends `Accept-Language: fr-FR`
- **THEN** the Inbox calendars are named "Eingang" and "Work · Eingang", project calendars keep their names, and a `PROPPATCH` of the Inbox's display name is still refused with 403
