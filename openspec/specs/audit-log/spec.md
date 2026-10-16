# audit-log Specification

## Purpose
Gives the owner a durable, queryable record of security-relevant events on the server, with strict limits on what the record may contain, owner-controlled retention, optional client address logging, and an export, without ever exposing task content.

## Requirements

### Requirement: Recorded events
The server SHALL record sign-in success and failure, sign-out, second-factor changes, passkey registration and removal, token creation and revocation, invitation creation, acceptance and revocation, role changes, security settings changes, data or audit exports, backup creation or restoration, each write tool call made with an `agent` token (`agent.write`), and every outgoing email as `email.sent` or `email.failed` with its kind and recipient address.

#### Scenario: Token creation is recorded
- **WHEN** a user creates an API token named "laptop script"
- **THEN** the log contains a `token.created` event with that user as actor, outcome `success`, and the token name and id in its details

#### Scenario: Task edits are not events
- **WHEN** a user creates, edits, completes or deletes tasks and projects from a device, the REST API or CalDAV
- **THEN** no audit event is recorded for those operations

#### Scenario: Assistant write is recorded without content
- **WHEN** an assistant with an `agent` token completes three tasks in one `complete_tasks` call
- **THEN** the log contains one `agent.write` event with the user as actor, outcome `success`, and details `tool`, `token_id`, `token_name` and `count: 3`, and no task title or other content

#### Scenario: Refused assistant write is recorded
- **WHEN** an assistant's write call is refused because the user's switch is off
- **THEN** the log contains an `agent.write` event with outcome `failure` and reason `writes_disabled_by_user`

#### Scenario: Sent email is recorded without its link
- **WHEN** an admin sends an invitation to bob@example.com by email
- **THEN** the log contains an `email.sent` event with the admin as actor, outcome `success`, details `email_kind: invitation` and `email: bob@example.com`, and neither the link nor the body

#### Scenario: Failed email is recorded
- **WHEN** a password reset message cannot be sent because the SMTP server rejected the credentials
- **THEN** the log contains an `email.failed` event with outcome `failure`, the account as target, no actor, and details `email_kind: password_reset` and `reason: auth`

#### Scenario: SMTP settings change is recorded
- **WHEN** the owner changes the SMTP host and password
- **THEN** the log contains `settings.changed` events for `smtp.host` with the old and new value and for `smtp.password` recording only that it was set, never the password

### Requirement: Event shape
Each event SHALL carry a time, name, outcome, the actor when known and the target when different. Events are never synced.

#### Scenario: Failed sign-in is recorded
- **WHEN** a sign-in fails because of a wrong password for an existing account
- **THEN** the log contains a `login.failed` event with outcome `failure`, the account as target, no actor, and the reason in its details

### Requirement: Content and privacy limits
An event's details SHALL be limited to an allow-list of identifiers and credential or setting names; no field of a task or project, no password, token secret, one-time code or recovery code SHALL ever be stored. The client address SHALL be recorded only when the owner has enabled address logging, and disabling it SHALL remove addresses from stored events. The user agent SHALL be stored truncated to 200 characters.

#### Scenario: Address logging off by default
- **WHEN** a fresh server records a sign-in
- **THEN** the event has no client address

#### Scenario: Owner enables then disables address logging
- **WHEN** the owner enables address logging, a sign-in is recorded, and the owner disables it again
- **THEN** the event recorded in between carried an address while logging was on and carries none after it was turned off

#### Scenario: Secret never stored
- **WHEN** a second-factor challenge fails with a wrong code
- **THEN** the recorded event contains the failure reason but not the submitted code

### Requirement: Owner access with filters
The owner SHALL read the log through `GET /api/v1/audit`, newest first, with optional filters on event name, actor, target, outcome and time range, and cursor-based pagination of at most 200 events per page. Members SHALL NOT read the full log. The log is fetched live; the client SHALL NOT cache it in browser storage, so it is unavailable offline.

#### Scenario: Filter by actor and range
- **WHEN** the owner requests events for one account within the last seven days
- **THEN** the response lists only matching events, newest first, with a cursor when more exist

#### Scenario: Member or anonymous access
- **WHEN** a member or an anonymous request reads `/api/v1/audit`
- **THEN** the response is a 403 `forbidden` error for the member and a 401 `unauthorized` error for the anonymous request

#### Scenario: Invalid filter
- **WHEN** the time range is malformed or the page size exceeds 200
- **THEN** the response is a 400 `invalid_input` error naming the parameter

### Requirement: Personal activity
Every signed-in user SHALL be able to read their own sign-in, sign-out, credential and token events through `GET /api/v1/me/activity`, limited to the last 90 days and 100 events, so they can notice access they did not perform. The response SHALL contain no events about other accounts.

#### Scenario: Member sees own sign-ins
- **WHEN** a member reads their activity after signing in from two browsers
- **THEN** both sign-in events are listed with time and truncated user agent, and no other account's events appear

#### Scenario: Anonymous request
- **WHEN** a request without credentials reads `/api/v1/me/activity`
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Retention and pruning
The owner SHALL set retention through `GET`/`PUT /api/v1/settings/audit` between 7 and 3650 days, default 90, and SHALL toggle address logging there. The server SHALL prune events older than the retention at least hourly and at startup. Retention is server configuration, not synced.

#### Scenario: Shorter retention prunes
- **WHEN** the owner lowers retention to 30 days while events older than that exist
- **THEN** those events are gone within the next pruning run and the audit setting change itself is recorded

#### Scenario: Invalid retention or wrong role
- **WHEN** retention is set to 3 days, or a member writes the settings
- **THEN** the response is a 400 `invalid_input` error for the value and a 403 `forbidden` error for the member

### Requirement: Export of the log
The owner SHALL download the log through `GET /api/v1/audit/export` as newline-delimited JSON with the same filters as the list, served as a download, and the export itself SHALL be recorded as an event. The user data export at `/api/v1/export` SHALL NOT include audit events.

#### Scenario: Export is produced and recorded
- **WHEN** the owner exports the log
- **THEN** the response is a download with one JSON object per line and a new `audit.exported` event appears in the log

#### Scenario: Member or anonymous export
- **WHEN** a member or an anonymous request calls the export route
- **THEN** the response is a 403 `forbidden` error for the member and a 401 `unauthorized` error for the anonymous request

### Requirement: Append-only record
There SHALL be no API to modify or delete individual events; pruning by retention and address scrubbing are the only removals. Events that describe a state change SHALL be stored in the same transaction as that change, so a change without its event or an event without its change cannot exist. The log SHALL live in the data directory and be included in any backup of it.

#### Scenario: No deletion route
- **WHEN** any client sends a delete or patch for an audit event
- **THEN** the response is a 404 `not_found` error and the event remains

#### Scenario: Atomic with the change
- **WHEN** an API token creation fails after the token row was written but before the response
- **THEN** either both the token and its event exist or neither does

### Requirement: Audit surfaces in Settings
Settings SHALL show the owner an Audit log panel with filters, a paginated table, the export action and the retention and address-logging settings, and SHALL show every user a Recent activity panel. Both SHALL be keyboard reachable, SHALL show an offline notice instead of stale data when the network is unavailable, and SHALL keep nothing in browser storage.

#### Scenario: Owner filters and exports
- **WHEN** the owner filters by `login.failed` in the last day and chooses export
- **THEN** the table shows only those events and the download carries the same filter

#### Scenario: Offline panel
- **WHEN** either panel is opened without a network connection
- **THEN** it shows that the log needs a connection and displays no events

### Requirement: Project invite link events
The server SHALL record `project_invite.created`, `project_invite.revoked` and `project_invite.accepted` with the acting account, the link id, the project id, the role and the bound email, in the transaction of the change. The secret and the project name SHALL never be recorded.

#### Scenario: Link accepted
- **WHEN** Bob joins a project through a link Alice created
- **THEN** the log contains `project_invite.accepted` with Bob as actor and the link id, project id and role in its details

#### Scenario: Link created
- **WHEN** Alice creates a project link
- **THEN** the log contains `project_invite.created` with Alice as actor and no secret or link in its details

### Requirement: Calendar feed URL events
The server SHALL record `calendar_feed.created`, `calendar_feed.rotated` and `calendar_feed.revoked` with the acting account, in the transaction of the change, and SHALL list them in the user's own activity. The feed secret, its URL and the URLs of calendar subscriptions SHALL never be recorded.

#### Scenario: Feed created
- **WHEN** a user creates their task feed URL
- **THEN** the log contains `calendar_feed.created` with the user as actor and no secret or URL in its details

#### Scenario: Rotation visible to the user
- **WHEN** a user rotates the feed and later reads `GET /api/v1/me/activity`
- **THEN** the `calendar_feed.rotated` event is listed with its time

#### Scenario: Subscriptions are not audited
- **WHEN** a user adds or deletes a calendar subscription
- **THEN** no audit event is recorded, as for webhooks

### Requirement: Public link events
The server SHALL record `public_link.created` and `public_link.revoked` with the acting account, the link id, the project id and the link's rights, in the transaction of the change. The secret, the link's name and the project name SHALL never be recorded. Ticks through a link are task edits and SHALL NOT be recorded, like every other task edit.

#### Scenario: Link created
- **WHEN** Alice creates a tick link for a project
- **THEN** the log contains `public_link.created` with Alice as actor and `public_link_id`, `shared_project_id` and `link_rights: tick` in its details, and no secret, name or link

#### Scenario: Link revoked
- **WHEN** an admin revokes that link
- **THEN** the log contains `public_link.revoked` with the admin as actor and the link id and project id in its details

#### Scenario: Tick is not an event
- **WHEN** a guest completes ten tasks through the link
- **THEN** no audit event is recorded for them
