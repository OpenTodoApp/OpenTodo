# Spec Delta

## Purpose
Lets a user bring the open issues assigned to them on GitHub or GitLab into OpenTodo as tasks that follow the issue (completed when it closes, reopened when it reopens, renamed when it is renamed), fetched by the server on a schedule with a personal access token, under one owner switch and the outbound policy shared with webhooks and calendar subscriptions. Nothing is written back to the provider.

## ADDED Requirements

### Requirement: Off by default, enabled by the owner
Issue connections SHALL be disabled until the owner enables them in Settings or through `PUT /api/v1/settings/issues`. While disabled, every `/api/v1/issues` route SHALL answer 404 and the server SHALL poll no connection. The switch SHALL take effect without a restart, SHALL be stored as the server setting `integrations.issues` and SHALL be audited as `settings.changed`. Every signed-in user SHALL read it through `GET /api/v1/settings/issues`; only the owner SHALL change it.

#### Scenario: Default
- **WHEN** a server starts and the owner has never touched the setting
- **THEN** `GET /api/v1/settings/issues` reports `enabled: false`, `GET /api/v1/issues/connections` answers 404 and no outbound request is made

#### Scenario: Owner enables it
- **WHEN** the owner sends `PUT /api/v1/settings/issues` with `{"enabled": true}`
- **THEN** the routes work on the next request, enabled connections are polled within a minute, and the audit log holds a `settings.changed` event for `integrations.issues`

#### Scenario: Member cannot change it
- **WHEN** a member calls `PUT /api/v1/settings/issues`
- **THEN** the response is a 403 `forbidden` error and the setting is unchanged

#### Scenario: Unauthenticated
- **WHEN** `/api/v1/settings/issues` is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Connection management
A signed-in user SHALL create, list, update, enable or disable and delete their own issue connections through Settings and `GET`/`POST /api/v1/issues/connections`, `PATCH`/`DELETE /api/v1/issues/connections/{id}`. A user SHALL have at most 5 connections and SHALL never see or touch another account's. Connections are server data: never operations, never synced, never exported, so managing them needs a connection to the server.

#### Scenario: Create a connection
- **WHEN** a user POSTs `{"provider": "github", "host": "https://github.com", "token": "<pat>", "name": "Work", "project_id": "<id>"}`
- **THEN** the response is 201 with the connection, without the token, its account check has been attempted and the result is in the connection's status

#### Scenario: Routes require authentication
- **WHEN** any `/api/v1/issues` route is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Sixth connection
- **WHEN** a user with 5 connections posts another
- **THEN** the response is a 409 `limit_reached` error and nothing is stored

#### Scenario: Another user's connection
- **WHEN** a user requests a connection id that belongs to a different account
- **THEN** the response is a 404 `not_found` error

#### Scenario: Delete keeps the tasks
- **WHEN** a user deletes a connection that created 40 tasks
- **THEN** the response is 204, the token is removed from the server, no further poll happens, and the 40 tasks stay as ordinary tasks with their `origin`

#### Scenario: Disable
- **WHEN** a user disables a connection
- **THEN** no poll of it happens until it is enabled again, and the tasks it created are unchanged

### Requirement: Credentials for connection writes
Creating a connection and replacing its token SHALL require a recent sign-in like creating an API token. Every write to a connection (create, change, delete, test, sync) SHALL be refused for `read` and `agent` API tokens; reads SHALL work for every scope.

#### Scenario: Stale session
- **WHEN** a session that has not proved its identity within the fresh window creates a connection or sends a `PATCH` with a `token`
- **THEN** the response is a 403 `reauth_required` error and nothing changes

#### Scenario: Read or agent token
- **WHEN** a `read` or `agent` API token creates, changes, deletes, tests or syncs a connection
- **THEN** the response is a 403 `insufficient_scope` error and nothing changes, while `GET` works

### Requirement: Connection fields
A connection SHALL have a provider (`github` or `gitlab`); a host, an `https` URL of at most 2,048 characters from which the API address is derived (`http` only for a host the owner's private-network setting allows); a name of at most 100 characters, defaulting to the host; a target project the user can write to, or none for the Inbox; a filter; a `map_labels` flag, off by default; a poll interval of 15 minutes to 24 hours, default 30 minutes; and an enabled flag, on by default.

#### Scenario: Invalid host
- **WHEN** a user submits a `ftp://` host, an empty one or one longer than 2,048 characters
- **THEN** the response is a 400 `invalid_input` error naming `host` and nothing is stored

#### Scenario: Interval too short
- **WHEN** a user sets `interval_minutes: 5`
- **THEN** the response is a 400 `invalid_input` error naming `interval_minutes` and the minimum of 15

#### Scenario: Project the user cannot write
- **WHEN** a user names a project that is archived, deleted or shared with them as a viewer
- **THEN** the response is a 400 `invalid_input` error naming `project_id`

#### Scenario: Name defaults to the host
- **WHEN** a user creates a connection to `https://gitlab.example.com` without a name
- **THEN** the connection is named `gitlab.example.com`

### Requirement: Filter
A connection's filter SHALL have a `scope`: `assigned` (issues assigned to the token's account, the default) or `repositories` (issues assigned to the account in at most 20 listed `owner/name` or `group/project` entries), and at most 10 label names that an issue must all carry to match. Pull requests and merge requests SHALL never match.

#### Scenario: Repository scope with a label
- **WHEN** the filter is `{"scope": "repositories", "repositories": ["acme/web"], "labels": ["bug"]}`
- **THEN** only issues of `acme/web` assigned to the account and labelled `bug` become tasks

#### Scenario: Too many repositories
- **WHEN** a user lists 21 repositories
- **THEN** the response is a 400 `invalid_input` error naming `repositories` and the limit of 20

#### Scenario: Pull and merge requests
- **WHEN** the provider's issue list contains a pull request or merge request
- **THEN** no task is created for it

### Requirement: Write-only token
The token SHALL be accepted on create and as `token` on `PATCH`, SHALL never be returned by any route, command or resource, and SHALL be reported only as `token_set: true`. Replacing the token SHALL restart a connection stopped for a token reason.

#### Scenario: Token never returned
- **WHEN** a user lists connections or reads one, in the app, with `ot issues list` or through the MCP resource
- **THEN** no response carries the token or any part of it; each connection reports `token_set: true`

#### Scenario: Replace a refused token
- **WHEN** a connection is stopped with `unauthorized_provider` and the user sends `PATCH` with a new `token`
- **THEN** the stop is cleared, the account check runs again and polling resumes at the next interval

### Requirement: Outbound policy
Connection hosts SHALL follow the private network protection of webhooks: loopback, link-local, unique-local or private, multicast, unspecified or cloud metadata addresses SHALL be refused at creation, at every host change and at every poll after resolving the host, unless the owner allowed private network targets; the connection SHALL go to the checked address, ignoring any proxy from the environment, with the token sent only to that host. Redirects SHALL NOT be followed.

#### Scenario: Private target refused
- **WHEN** a user adds `https://192.168.1.20/` as a host and the owner has not allowed private targets
- **THEN** the response is a 400 `private_target` error explaining the owner setting and nothing is stored

#### Scenario: Owner allows the local network
- **WHEN** the owner has allowed private network targets and the same host is added
- **THEN** it is accepted and polled

#### Scenario: Redirect refused
- **WHEN** a host answers a poll with a redirect
- **THEN** the redirect is not followed, the poll fails with reason `redirect_refused` and the token is not sent to the redirect target

#### Scenario: Host turns private
- **WHEN** a connection's host starts resolving to a private address and private targets are not allowed
- **THEN** the poll fails with `private_target`, the connection is marked as stopped, and no further poll happens until the user edits or re-enables it

### Requirement: Request limits
Every request to a provider SHALL carry a 20-second timeout and a 2 MB body limit. A poll SHALL read at most 10 pages of 100 issues; a connection with more matching issues SHALL get the rest on later polls, oldest changes first, and its status SHALL say the run was partial.

#### Scenario: Body too large
- **WHEN** a provider answers a page with more than 2 MB
- **THEN** the request is abandoned, the poll fails with reason `too_large` and nothing is written

#### Scenario: Partial run
- **WHEN** a connection matches 1,500 issues on its first poll
- **THEN** the first 1,000 become tasks, the status says the run was partial, and the next poll continues with the remaining 500

### Requirement: Token check
`POST /api/v1/issues/connections/{id}/test` SHALL ask the provider for the token's account (one request for the account and, to learn whether the token may read issues, one request listing at most one issue) and return the account login and whether the token can read issues, updating the connection's status. A user SHALL make at most 12 checks per hour.

#### Scenario: Working token
- **WHEN** a user tests a connection whose token is valid
- **THEN** the response reports `ok: true` and the account login, and the connection's status shows the login

#### Scenario: Refused token
- **WHEN** the provider answers the check with 401
- **THEN** the response reports `ok: false` with reason `unauthorized_provider`, the connection's status shows it, and the token is unchanged

#### Scenario: Too many checks
- **WHEN** a user tests connections for the thirteenth time within an hour
- **THEN** the response is 429 `rate_limited` and no request leaves the server

### Requirement: Scheduled polling
While the owner switch is on, the server SHALL poll every enabled connection at its interval, in one server process at a time, at most two polls in flight, with conditional requests (`If-None-Match` with the stored `ETag`) and an updated-since cursor so unchanged issues are neither downloaded nor re-processed. A poll SHALL honour the provider's rate-limit answer (429, or 403 with a reset time) by waiting until the reset. A failed poll SHALL change nothing about the tasks already created.

#### Scenario: Unchanged
- **WHEN** the provider answers a conditional request with 304
- **THEN** nothing is written, no body is downloaded and the connection's last-checked time advances

#### Scenario: Provider rate limit
- **WHEN** the provider answers 403 with a rate-limit reset 20 minutes away
- **THEN** the poll stops, the status says the provider's rate limit was reached and when polling resumes, and no request to that host is made before the reset

#### Scenario: Only changes are processed
- **WHEN** a connection has 300 linked issues and one of them was renamed since the last poll
- **THEN** the poll downloads that one issue, writes its new title and touches no other task

### Requirement: Sync now
`POST /api/v1/issues/connections/{id}/sync` SHALL run the connection's poll at once and return the new status with the counts of tasks created, completed, reopened and renamed. Hand-triggered syncs and token checks SHALL share a limit of 12 per user per hour.

#### Scenario: Sync now
- **WHEN** a user calls `POST /api/v1/issues/connections/{id}/sync`
- **THEN** the poll runs at once and the response carries the new status and counts

#### Scenario: Too many syncs
- **WHEN** a user triggers the thirteenth sync or check within an hour
- **THEN** the response is 429 `rate_limited` and no poll runs

#### Scenario: Stopped connection
- **WHEN** a user syncs a connection stopped with `token_missing`
- **THEN** the response is a 409 `connection_stopped` error naming the reason and no request leaves the server

### Requirement: Poll backoff
After a failed poll the connection's interval SHALL double, up to 6 hours, and return to its configured value after a success. A poll refused by the provider as unauthorized, by the outbound policy, or for want of a token SHALL stop the schedule, with the reason on the connection, until the user replaces the token, edits the host or re-enables the connection.

#### Scenario: Host down
- **WHEN** a host times out on three polls in a row
- **THEN** the tasks created so far are unchanged, the status shows the error and the time of the last success, and the next attempt waits longer each time

#### Scenario: Token revoked at the provider
- **WHEN** the provider answers a poll with 401
- **THEN** the connection is marked as stopped with reason `unauthorized_provider`, the panel asks for a new token, and no poll happens until a token is set

#### Scenario: Token missing after a restore
- **WHEN** the server was restored from a backup, which does not contain the secrets directory
- **THEN** each connection is marked as stopped with reason `token_missing` at its next poll, and works again once the user enters a token

### Requirement: An issue becomes a task
For each matching open issue not yet linked, a poll SHALL create one task in the connection's target project or the Inbox, with priority 4 and no due date: the title from the issue title, the description from the issue body (Markdown as stored), labels when `map_labels` is on, and `origin` as `task-origin` defines it: `kind: "issue"`, the provider, the reference `owner/repo#123` as `id` and `title`, the web address as `url`. An issue already closed when first seen SHALL NOT create a task.

#### Scenario: New assigned issue
- **WHEN** an issue `acme/web#42` titled "Fix login redirect" with a body is assigned to the connected account and the connection targets project "Work"
- **THEN** a task "Fix login redirect" appears in "Work" with the body as notes and `origin` `{kind: "issue", provider: "github", id: "acme/web#42", url: "https://github.com/acme/web/issues/42", title: "acme/web#42"}`

#### Scenario: Closed before first seen
- **WHEN** the connection's first poll lists an issue that was closed before the connection existed
- **THEN** no task is created for it

#### Scenario: Inbox target
- **WHEN** a connection has no target project
- **THEN** its tasks are created in the Inbox

### Requirement: Task writes through the operation log
Tasks and labels created by a poll SHALL be written as operations with device id `issues:<connection-id>`, with ids derived from the connection and the issue so a repeated or interrupted poll yields one task, so offline devices see them on their next sync and they converge like any other task. The description SHALL be cut like an email body when it would not fit one synced value.

#### Scenario: Restart during a poll
- **WHEN** the server restarts after creating a task from an issue but before recording the link
- **THEN** the next poll recognises the issue and creates no second task

#### Scenario: Long body
- **WHEN** an issue's body is 200 KB long
- **THEN** the description holds the start of the body up to the value limit, ends with the note that the rest did not fit, never splits a character, and the operation is accepted

#### Scenario: Appears on devices
- **WHEN** a task has been created from an issue and the user's phone syncs
- **THEN** the phone shows the task with its origin, and the task can be edited, scheduled and completed like any other

### Requirement: A task follows its issue
For a linked issue a poll SHALL change a task only when the issue changed since the poll last saw it: when the issue closed, the task is completed (`completed_at` set to the close time) if it is open; when the issue reopened, the task is reopened if it is completed; when the issue was renamed, the task's title becomes the new issue title and `origin.title` is unchanged. The poll SHALL NOT change the description after creation and SHALL never trash, restore or delete a task.

#### Scenario: Issue closed
- **WHEN** issue `acme/web#42` is closed and the next poll runs
- **THEN** the task is completed with `completed_at` equal to the close time, and devices show it completed after their next sync

#### Scenario: Issue reopened
- **WHEN** a closed issue whose task is completed is reopened
- **THEN** the next poll reopens the task

#### Scenario: Body edited at the provider
- **WHEN** the issue's body is edited after the task was created
- **THEN** the task's notes are unchanged

#### Scenario: Trashed task
- **WHEN** a user moves a linked task to the Trash and the issue closes
- **THEN** nothing is written for that task; it stays in the Trash

### Requirement: The user's edits stand
A user's own change to a linked task SHALL stand until the issue changes the same field again, and concurrent changes SHALL converge by field-level last-writer-wins like any other operations. An issue that stops matching the filter SHALL leave its task as it is.

#### Scenario: User completes first
- **WHEN** a user completes the task of an open issue and the issue stays open
- **THEN** no poll reopens the task; nothing is sent to the provider

#### Scenario: User renames, then the issue is renamed
- **WHEN** a user renames the task to "Fix redirect (prod)" and later the issue is renamed to "Fix login redirect on mobile"
- **THEN** the task stays "Fix redirect (prod)" until the issue's rename is seen, then becomes "Fix login redirect on mobile"

#### Scenario: Issue no longer matches
- **WHEN** an issue is unassigned from the connected account
- **THEN** its task stays as it is and stops following the issue; the status counts it as unlinked

#### Scenario: Offline device edits converge
- **WHEN** a device renames a linked task offline while a poll completes the task, and the device syncs
- **THEN** every device shows the device's title and the poll's completion

### Requirement: Label mapping
When a connection has `map_labels` on, each issue label SHALL map to the user's label of the same name, case-insensitive, created through the operation log when missing, and the mapped labels SHALL be set on the task at creation. When the issue's labels change, the poll SHALL replace only the labels it mapped before and keep labels the user added. With `map_labels` off, tasks get no labels from issues.

#### Scenario: Labels created
- **WHEN** an issue carries labels `bug` and `Backend`, the user has a label "backend" and `map_labels` is on
- **THEN** the task carries the existing "backend" label and a new "bug" label created by the connection

#### Scenario: User's label kept
- **WHEN** the user adds the label "this week" to a linked task and the issue later loses `bug`
- **THEN** the task keeps "this week" and loses "bug"

#### Scenario: Mapping off
- **WHEN** `map_labels` is off and an issue carries labels
- **THEN** the task is created without labels

### Requirement: Connection limits per server
A server SHALL poll at most two connections at a time, SHALL create at most 1,000 tasks per connection per poll, and SHALL count the poller's operations against a hosted tenant's operation limits like any device's; operations refused by a limit SHALL fail the poll with a status naming the limit, to be retried at the next interval without duplicating tasks.

#### Scenario: Tenant at its operation limit
- **WHEN** a hosted tenant reaches its operations-per-hour limit during a poll
- **THEN** the poll stops with a status naming the limit, the tasks created so far stay, and the next poll continues with the remaining issues

### Requirement: Encrypted accounts
Creating or enabling a connection for an account with end-to-end encryption SHALL be refused with 409 `encryption_enabled`, explaining that the server would write issue titles and bodies into the account's history in plaintext on every poll. Enabling encryption SHALL stop the account's connections with reason `encrypted_account`, and the encryption screen SHALL say so.

#### Scenario: Encrypted account refused
- **WHEN** an encrypted account posts a connection
- **THEN** the response is a 409 `encryption_enabled` error and nothing is stored

#### Scenario: Enable encryption with a connection on
- **WHEN** a user with an enabled connection turns on encryption
- **THEN** the connection is stopped with reason `encrypted_account`, the encryption screen says so, and no poll happens afterwards

### Requirement: Issues screen
Settings → Integrations SHALL show an Issues panel with the owner switch (its state for members) and the user's connections as cards that lead with their state (off; up to date and when; polling; failed with the last error; stopped with its reason), then provider, host and account login, target project, filter and the last run's counts, with the actions Sync now, Test token, Edit, Disable or Enable, and Delete, every one reachable with the keyboard and Delete confirmed in a dialog.

#### Scenario: Connection card
- **WHEN** a user opens the panel with a connection whose last poll failed
- **THEN** its card shows the failure first with the error and the time of the last success, then the host and account, the project and the filter, and the actions Sync now, Test token, Edit, Disable and Delete

#### Scenario: Feature off for members
- **WHEN** the owner has not enabled issue connections and a member opens the panel
- **THEN** it says the owner has not enabled issue connections and offers no actions

#### Scenario: Delete confirmed
- **WHEN** a user chooses Delete on a connection
- **THEN** a dialog says the token is removed and the tasks stay, and asks to confirm before anything is deleted

#### Scenario: Keyboard
- **WHEN** a user tabs to a card's Sync now action and presses Enter
- **THEN** the poll runs and the card's state updates without a reload

### Requirement: Connection editor
Adding or editing a connection SHALL take the provider, host, token (a password field, never prefilled; "Replace token" when editing), filter, target project through the project picker, label mapping and interval, and SHALL show the server's validation error beside the field it names. Because connections live on the server, the panel SHALL show the last loaded state while offline and disable actions until the connection returns.

#### Scenario: Token field empty on edit
- **WHEN** a user opens Edit on a connection
- **THEN** the token field is empty and labelled "Replace token", and saving without typing one keeps the stored token

#### Scenario: Validation error shown in place
- **WHEN** the server answers `invalid_input` naming `host`
- **THEN** the dialog stays open with the message beside the host field

#### Scenario: Offline
- **WHEN** the panel is opened without a connection to the server
- **THEN** the previously loaded cards are visible, actions are disabled and the panel says a connection is required

### Requirement: Privacy of tokens and issue content
The server SHALL store tokens outside the database, excluded from backups and exports, SHALL never return them through any API, SHALL never log issue titles, bodies, hosts or tokens at the default log level, and SHALL send a token only to the host it was entered for.

#### Scenario: Export
- **WHEN** a user exports their data
- **THEN** the export holds the tasks with their `origin` and no connection, host or token

#### Scenario: Network audit
- **WHEN** a connection is enabled and network traffic is inspected
- **THEN** the only outbound connections of the feature are to the connection's host
