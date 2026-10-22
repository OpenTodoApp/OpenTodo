## MODIFIED Requirements

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

### Requirement: Discovery and calendar collections
The endpoint SHALL support discovery (`/.well-known/caldav`, current-user-principal, calendar-home-set) and SHALL expose one calendar collection per non-archived, non-deleted project the user can see (their own and the shared projects they are a member of) plus an `Inbox` calendar, each reporting its display name, colour, that it supports only VTODO, the user's privileges, a CTag and a sync token. The well-known redirect SHALL carry an absolute `Location`: `OPENTODO_BASE_URL` when configured, otherwise the origin the client asked for (the request's scheme and host, or a trusted proxy's `X-Forwarded-Proto` and `X-Forwarded-Host`). A `PROPFIND` on the host root SHALL redirect the same way to `/dav/`, an `OPTIONS` on the host root SHALL report the `DAV` capabilities, and `/principals/…` SHALL redirect to the same path under `/dav/`, so a client that probes the host root finds the principal. Calendars of shared projects SHALL be read-only for viewers. Another user's paths SHALL answer 404.

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
