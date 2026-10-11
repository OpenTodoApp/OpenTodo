# Spec Delta

## MODIFIED Requirements

### Requirement: Demo accounts
With demo mode on, the server SHALL keep a hidden owner whose random password is never stored or shown, created on an empty data directory. There SHALL be no shared demo account and no published password: every visitor works in a sandbox account of their own. On the first start of this version an existing shared demo account and its collaborator SHALL be deleted. Startup SHALL be idempotent.

#### Scenario: First start
- **WHEN** a server with demo mode on starts on an empty data directory
- **THEN** only the hidden owner exists and no account can be signed into with a password

#### Scenario: Upgrade from a shared demo account
- **WHEN** a demo instance with the shared demo account starts this version
- **THEN** the shared account, its collaborator and their data are deleted

#### Scenario: Restart
- **WHEN** the server restarts with demo mode on
- **THEN** no account is created twice and live sandboxes are kept

### Requirement: Seeded demo data
Each new sandbox SHALL be seeded with projects, sections, a sub-project, labels, recurring tasks, subtasks, comments, a project shared with the sandbox's own demo collaborator, saved views, a dashboard, reminders, completed and trashed items. Every write SHALL go through the op log with server ops and due dates SHALL be relative to the day the sandbox is created.

#### Scenario: Data goes through the op log
- **WHEN** a sandbox has been seeded
- **THEN** every stored field is backed by an op with the same value and clock

#### Scenario: Own copy
- **WHEN** two visitors each start a sandbox
- **THEN** each sees a complete set of sample data and edits in one never appear in the other

#### Scenario: Fresh dates
- **WHEN** a sandbox is created on any day
- **THEN** tasks due today, overdue and upcoming exist relative to that day

### Requirement: Nightly reset
Every day at 03:00 UTC, and at startup when the last reset predates the most recent 03:00 UTC, the server SHALL delete every sandbox with its accounts, sessions and data and then reclaim the freed disk space. Visitors whose sandbox was deleted SHALL be told so and offered a new one.

#### Scenario: Reset deletes every sandbox
- **WHEN** the nightly reset runs
- **THEN** no sandbox account, session, op or field remains and the database file shrinks accordingly

#### Scenario: Connected device recovers
- **WHEN** the reset runs while a sandbox tab is open
- **THEN** its next request gets 401 `demo_expired`, it clears its local data and offers a new sandbox without an error page

#### Scenario: Offline edit of wiped data
- **WHEN** a tab queued edits before the reset and syncs afterwards
- **THEN** the edits are discarded with the deleted sandbox and appear in no other account

#### Scenario: Missed reset
- **WHEN** the server was stopped at 03:00 UTC and starts later that day
- **THEN** it deletes all sandboxes before serving requests

### Requirement: Demo sign-in and banner
With demo mode on, `GET /api/v1/auth/status` SHALL include a `demo` object with a short-lived creation token, the sandbox lifetimes and the next reset, and no credentials. "Try the demo" SHALL create a sandbox and sign the browser into it. The app SHALL show a banner that the sandbox is private and deleted after 2 hours of inactivity, and Settings SHALL hide or disable restricted controls with a short note.

#### Scenario: Try the demo
- **WHEN** a visitor clicks "Try the demo"
- **THEN** a new sandbox is created, they are signed into it and see the sample data and the banner

#### Scenario: Returning visitor
- **WHEN** a visitor comes back within the sandbox lifetime in the same browser
- **THEN** they are still signed into the same sandbox with their changes

#### Scenario: Restricted control
- **WHEN** a sandbox opens Settings
- **THEN** Import is disabled and restricted sections are replaced by a note saying they are off on the demo

#### Scenario: Status without demo mode
- **WHEN** demo mode is off and the status is requested
- **THEN** the response has no `demo` field

## ADDED Requirements

### Requirement: Sandbox isolation
A sandbox SHALL only read and write its own personal data and the project shared with its own non-interactive collaborator, whose account has no password and no session. Nothing a sandbox writes SHALL be visible to another sandbox or to anonymous visitors: membership changes stay refused, and assignments, mentions, notifications and activity stay inside the sandbox.

#### Scenario: Content stays private
- **WHEN** a visitor writes a task title and a comment in their sandbox
- **THEN** no other sandbox and no unauthenticated request can read them

#### Scenario: No way to share out
- **WHEN** a sandbox tries to add any account as a project member or assign a task to an account outside its project
- **THEN** the request is refused and nothing changes

### Requirement: Sandbox expiry
A sandbox SHALL be deleted with its accounts, sessions and data after 2 hours without authenticated requests and at most 24 hours after creation, by a cleanup job that runs at least every 5 minutes in one server process. A request with the session of a deleted sandbox SHALL get 401 `demo_expired`; the app SHALL then clear its local data and offer a new sandbox.

#### Scenario: Idle sandbox expires
- **WHEN** a sandbox has had no requests for more than 2 hours and the cleanup job runs
- **THEN** its accounts, sessions, ops and fields are gone

#### Scenario: Open tab after expiry
- **WHEN** a tab of an expired sandbox syncs
- **THEN** it receives 401 `demo_expired`, clears its local data and shows "Your demo sandbox has expired" with a button to start a new one

### Requirement: Demo abuse limits
The server SHALL bound demo use: a cap on live sandboxes (evicting the least recently active idle one, else 503 `demo_busy`), at most 5 new sandboxes per client address per hour (429), at most 600 ops per sandbox per hour and 5,000 in total (429 `demo_limit`), field sizes of 4 KB for text and 32 KB for notes, and no new sandboxes above a database size threshold.

#### Scenario: Write budget
- **WHEN** a sandbox sends its 601st op within an hour
- **THEN** the batch is refused with 429 `demo_limit`, nothing is applied and the app shows a notice while keeping its queue

#### Scenario: Creation flood
- **WHEN** one address requests a sixth sandbox within an hour
- **THEN** the request gets 429 and no account is created

#### Scenario: Full demo
- **WHEN** the live-sandbox cap is reached and no sandbox has been idle for 15 minutes
- **THEN** new visitors get 503 `demo_busy` with a message to try again later

### Requirement: Sandbox creation needs the sign-in page
Creating a sandbox SHALL require a same-origin POST carrying a single-use creation token issued by `GET /api/v1/auth/status` and valid for 10 minutes, so crawlers and link previews never create sandboxes. Sandbox creation SHALL be the only unauthenticated write allowed in demo mode besides sign-in.

#### Scenario: Missing or reused token
- **WHEN** a sandbox is requested without a valid token or with a token already used
- **THEN** the request is refused with 403 and no account is created

#### Scenario: Link preview
- **WHEN** a chat app fetches the demo URL to build a preview
- **THEN** no sandbox is created

### Requirement: Visitor content is not indexed
In demo mode every response SHALL carry `X-Robots-Tag: noindex, nofollow`, the served page SHALL declare `noindex`, and links in comments and notes SHALL render with `rel="nofollow ugc noopener noreferrer"`, so visitor content has no search or link value.

#### Scenario: Robots header
- **WHEN** any URL of a demo instance is requested
- **THEN** the response carries `X-Robots-Tag: noindex, nofollow`

#### Scenario: Visitor link
- **WHEN** a sandbox comment contains a link
- **THEN** it renders with `rel="nofollow ugc noopener noreferrer"`
