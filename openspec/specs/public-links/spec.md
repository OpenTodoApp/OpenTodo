# public-links Specification

## Purpose
Lets a project's owner or admin hand out a revocable link that shows one project to people without an account, optionally letting them tick items, with every tick written through the op log and attributed to the link.

## Requirements

### Requirement: Public link creation
The project's owner or an admin SHALL create a public link through `POST /api/v1/projects/{id}/public-links` with `rights` `view` or `tick`, an optional `name` (1–60 characters) and an optional `expiresInDays` (1–90; absent means no expiry). The secret SHALL be returned once and stored only as a hash. Links are server-side data, never ops: they never sync and need a connection; creation needs a fresh session.

#### Scenario: Owner creates a tick link
- **WHEN** the owner posts `{"rights":"tick","name":"Grandma"}` to the project's public-links route
- **THEN** the response is 201 with the link's `id`, `rights`, `name`, `expiresAt` (null) and a `link` ending in `/public/<secret>` that is never returned again

#### Scenario: Admin of a shared project
- **WHEN** a project admin posts `{"rights":"view"}`
- **THEN** the response is 201 and the link lists the admin as its creator

#### Scenario: Viewer, editor or stranger
- **WHEN** a viewer or editor of the project posts to the route, or a non-member does
- **THEN** the viewer or editor gets 403 `forbidden`, the non-member 404 `not_found`, and no link is created

#### Scenario: Anonymous or limited token
- **WHEN** a request without credentials, or with a `read` or `agent` API token, posts to the route
- **THEN** the response is 401 `unauthorized` or 403 `insufficient_scope` and no link is created

#### Scenario: Invalid input
- **WHEN** the body has unknown `rights`, a `name` longer than 60 characters or `expiresInDays` outside 1–90
- **THEN** the response is a 400 `invalid_input` error naming the field

#### Scenario: Encrypted account, unshared project
- **WHEN** an account with end-to-end encryption on creates a link for a project it has not shared
- **THEN** the response is a 409 `encryption_enabled` error and no link exists

#### Scenario: Mass creation
- **WHEN** an account creates a 21st public link within one hour
- **THEN** the response is a 429 `rate_limited` error

### Requirement: Public link list and revocation
The project's owner and admins SHALL list its active links through `GET /api/v1/projects/{id}/public-links` (id, rights, name, creator, creation, expiry and last-opened times; never a secret) and revoke one through `DELETE /api/v1/projects/{id}/public-links/{linkId}`. Revocation takes effect on the server at once; no device holds links, so nothing has to converge.

#### Scenario: List active links
- **WHEN** an admin lists the links after one expired and one was revoked
- **THEN** only the active links are listed, each with rights, name, creator name, expiry and `lastUsedAt`, and none carries a secret

#### Scenario: Revoke a link
- **WHEN** the owner deletes an active link and someone opens it afterwards
- **THEN** the delete returned 204 and the public route answers 404 `link_invalid`

#### Scenario: Revoke refused
- **WHEN** an editor sends the delete, or the id is unknown
- **THEN** the editor gets 403 `forbidden`, the unknown id 404 `not_found`, and nothing changes

#### Scenario: Anonymous list
- **WHEN** a request without credentials lists or revokes links
- **THEN** the response is 401 `unauthorized`

### Requirement: Public read of a project
`GET /api/v1/public/{token}` SHALL need no authentication and no cookie and SHALL return the project's name and colour, the link's rights, its sections, its open tasks (id, title, due, priority, section, parent, position, completion time) and tasks completed in the last 24 hours, plus the server time. It SHALL serve no notes, descriptions, labels, assignees, comments, member names or ids of accounts. It reads the server's materialised state; nothing is stored on the reading device.

#### Scenario: Valid view link
- **WHEN** an anonymous client requests a view link's route
- **THEN** the response is 200 with `projectName`, `rights: "view"`, `sections`, `tasks` and `serverTime`, the tasks carry no `description`, `notes_doc`, `labels` or `assignee_id`, and no `Set-Cookie` header is sent

#### Scenario: Recently completed tasks included
- **WHEN** a task was completed two hours ago and another two days ago
- **THEN** the first is returned with its `completed_at` and the second is absent

#### Scenario: Session ignored
- **WHEN** a signed-in member of another project requests a link's route with their session cookie
- **THEN** the response is the same as for an anonymous client

#### Scenario: Invalid link
- **WHEN** the secret is unknown, expired or revoked
- **THEN** the response is a 404 `link_invalid` error with the same shape in every case

### Requirement: Ticking through a public link
`POST /api/v1/public/{token}/tick` with `{taskId, completed}` SHALL, for a `tick` link, complete or reopen one open or recently completed task of the project as operations authored by the link's creator with device `public:<link-id>` and server time, through the same path as an API write. Devices receive it on their next sync and concurrent edits converge by last-writer-wins. A recurring task SHALL complete its occurrence as an API completion does.

#### Scenario: Tick a task
- **WHEN** a guest posts `{"taskId":"t1","completed":true}` to a tick link
- **THEN** the response is 200 with the task's new `completed_at`, the stored op carries device `public:<link-id>` and the creator as actor, and the members' devices are woken to sync

#### Scenario: Reopen a mis-tap
- **WHEN** the guest posts `{"taskId":"t1","completed":false}` within 24 hours
- **THEN** the task is open again on every device after their next sync

#### Scenario: Recurring task
- **WHEN** the guest ticks a task that repeats every week
- **THEN** an occurrence record is created and the task's due date moves to the next week, as when the API completes it

#### Scenario: Concurrent edit on a device
- **WHEN** the guest ticks a task while a member, offline, changes its title, and the member syncs afterwards
- **THEN** every device shows the task completed with the new title

#### Scenario: View link
- **WHEN** a guest posts a tick to a `view` link
- **THEN** the response is a 403 `forbidden` error and nothing changes

#### Scenario: Task outside the project
- **WHEN** the body names a task of another project, a deleted task or an unknown id
- **THEN** the response is a 404 `not_found` error and nothing changes

#### Scenario: Invalid link or body
- **WHEN** the secret is invalid, or `completed` is missing
- **THEN** the response is 404 `link_invalid` for the secret and 400 `invalid_input` for the body, and nothing changes

### Requirement: Public links are checked at use time
Every public request SHALL re-check the link against current state. A link SHALL answer 404 `link_invalid` when it is revoked or expired, when its project is deleted or archived, when its creator was deactivated or is no longer the project's owner or admin, or when the project is unshared and its creator has end-to-end encryption on. The link row stays until revoked, so restoring the condition makes it work again.

#### Scenario: Creator demoted
- **WHEN** the admin who created a link is made an editor and a guest opens the link
- **THEN** the response is 404 `link_invalid`

#### Scenario: Project archived then unarchived
- **WHEN** the project is archived, a guest opens the link, the project is unarchived, and the guest reloads
- **THEN** the first request is 404 `link_invalid` and the second is 200

#### Scenario: Tick after revocation
- **WHEN** a guest's page is open, the owner revokes the link, and the guest ticks a task
- **THEN** the response is 404 `link_invalid`, nothing is written, and the page says the link no longer works

### Requirement: Public device ids are reserved
Operations whose device starts with `public:` SHALL be written only by the server for ticks. `POST /api/v1/sync` SHALL refuse a request whose device, or any submitted op's device, starts with `public:` with 400 `invalid_op`, so a device cannot make its edits look like a guest's.

#### Scenario: Forged public device
- **WHEN** a device submits ops with device `public:abc`
- **THEN** the response is 400 `invalid_op` and nothing is stored

### Requirement: Public link attribution
A change written through a public link SHALL be attributed to the link wherever changes are shown: a task's history labels it "Public link (<name>)" for the project's owner and admins and "Public link" for other members, and the activity feed and a task's activity show it as the link's event, never merged with the creator's own events. Names are resolved when read; nothing is stored or synced beyond the op's device id.

#### Scenario: History label
- **WHEN** a guest ticks a task through the link "Grandma" and the owner opens the task's history online
- **THEN** the change group is labelled "Public link (Grandma)" and the editor of the same project sees "Public link"

#### Scenario: Activity feed
- **WHEN** the guest ticks a task in a shared project while a member has the feed open
- **THEN** the feed shows "Public link completed <task>" within a few seconds, not the creator's name

### Requirement: Public responses are not indexed or referred
Every response under `/api/v1/public/` and the page at `/public/<secret>` SHALL carry `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`, SHALL set no cookie, and SHALL be served with `Cache-Control: no-store`. The public page SHALL render task titles as plain text and SHALL contain no link to another site, so the secret never leaves the page as a referrer.

#### Scenario: Robots and referrer headers
- **WHEN** a client requests `/public/<secret>` or `/api/v1/public/<secret>`
- **THEN** both responses carry `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`

#### Scenario: URL in a title
- **WHEN** a task's title contains `https://example.com`
- **THEN** the public page shows the text without an anchor

### Requirement: Public link rate limits
Requests with a valid secret SHALL be limited per link (120 reads and 60 ticks per minute) and per client address (120 per minute); requests with an unknown secret SHALL be charged to the per-address sign-in limiter so guessing links costs as much as guessing passwords. Secrets SHALL never be logged or audited.

#### Scenario: Guessing links
- **WHEN** one address sends 11 requests with unknown secrets within a minute
- **THEN** the 11th answers 429 `rate_limited`, and so do that address's sign-in attempts in the same window

#### Scenario: Busy link
- **WHEN** a link receives its 61st tick within a minute
- **THEN** the response is 429 `rate_limited` and nothing is written

#### Scenario: Request log
- **WHEN** a public route is called
- **THEN** the server log records the path with the secret redacted

### Requirement: Public page
Opening `/public/<secret>` SHALL show, without sign-in, the project's name, a notice that the list is public (and, for tick links, that anyone with the link can tick items), the open tasks grouped by section with subtasks under their parent, due dates and priorities, and recently completed tasks shown ticked. It SHALL keep no local copy, refresh every 30 seconds while visible and after each tick, show when it last updated, and say when the server cannot be reached or the link no longer works.

#### Scenario: Tick link on a phone
- **WHEN** a guest opens a tick link on a 360 px wide phone
- **THEN** the notice is visible above the list, every task has a checkbox of at least 44×44 px, and tapping one marks the task ticked at once

#### Scenario: View link
- **WHEN** a guest opens a view link
- **THEN** the tasks have no checkboxes and the notice says the list is read-only

#### Scenario: Keyboard
- **WHEN** a guest moves through a tick link's tasks with Tab and presses Space on one
- **THEN** that task is ticked and the focus stays on its row

#### Scenario: Offline
- **WHEN** the device loses its connection
- **THEN** the page keeps the last list on screen, says it could not refresh, and retries when the network returns

#### Scenario: Revoked while open
- **WHEN** the link is revoked and the page refreshes
- **THEN** the page replaces the list with a message that the link no longer works

### Requirement: Public links in the share dialog
The share dialog SHALL offer the owner and admins a "Share with a public link" section: rights, optional name and expiry, the created link shown once with a copy button and a notice, and the active links with their name, rights, expiry, last-opened time and a revoke action. Every action SHALL work with the keyboard. Offline, the controls SHALL be disabled with an explanation.

#### Scenario: Create and copy
- **WHEN** the owner creates a tick link named "Group chat" in the share dialog
- **THEN** the link is shown with a copy button and a notice that it will not be shown again, and it appears in the active list with "Anyone with this link can tick items"

#### Scenario: Viewer sees no section
- **WHEN** a viewer or editor opens the member list
- **THEN** no "Share with a public link" section is shown

#### Scenario: Offline
- **WHEN** the dialog is opened without a network connection
- **THEN** creating and revoking are disabled and a message says public links need a connection

### Requirement: Published projects are marked
While online, the project header SHALL show the owner and admins a "Public" badge when the project has at least one active link, opening the share dialog's public links section when activated. The badge is read from the server when the project opens and is absent offline; it never comes from synced data.

#### Scenario: Badge after creation
- **WHEN** the owner creates a public link and closes the dialog
- **THEN** the project header shows "Public" next to the project name

#### Scenario: Badge after revocation
- **WHEN** the last active link is revoked
- **THEN** the badge disappears without a reload
