# demo-mode Specification

## Purpose
Defines demo mode: a public instance with shared demo accounts, realistic data written through the op log, a nightly reset that devices recover from on their own, and features that could be abused on a public server refused with a clear error.

## Requirements

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

### Requirement: Restricted features
With demo mode on, requests to sign-up, invitations, user administration, password change or reset including the self-service reset request and sign-up verification, signing out everywhere, API tokens, app passwords, CalDAV, passkeys, two-factor, server settings, backups, webhooks, email to task, import, end-to-end encryption, web push, sharing changes, MCP and the in-app assistant SHALL be refused with 403 `demo_restricted` before authentication. The deny list SHALL refuse exactly the routes whose declared route policy says a demo refuses them. Rate limits SHALL stay.

#### Scenario: Refused while signed in
- **WHEN** the signed-in demo account POSTs to `/api/v1/tokens`
- **THEN** the response is 403 with error code `demo_restricted` and no token exists

#### Scenario: Refused without authentication
- **WHEN** an anonymous client POSTs to `/api/v1/auth/register`
- **THEN** the response is 403 `demo_restricted` and no account is created

#### Scenario: Self-service reset and verification refused
- **WHEN** an anonymous client POSTs to `/api/v1/auth/password-reset` or `/api/v1/auth/verify/{token}`
- **THEN** the response is 403 `demo_restricted`, no message is sent, and the authentication status reports `outgoingEmail.enabled: false`

#### Scenario: Everyday use allowed
- **WHEN** the demo account creates, edits, completes and deletes tasks, syncs or exports
- **THEN** the requests succeed as on any instance

#### Scenario: Assistant refused
- **WHEN** a demo account calls `POST /api/v1/assistant/turn` or `PUT /api/v1/me/assistant`
- **THEN** the response is 403 `demo_restricted`, no provider is contacted, and the app shows that the assistant is not available on the demo

#### Scenario: Demo mode off
- **WHEN** demo mode is off
- **THEN** no request is ever answered with `demo_restricted`

### Requirement: No outbound requests or email on the demo
The server SHALL make no outbound request and SHALL send no email even when `OPENTODO_SMTP_*` is set.

#### Scenario: SMTP configured on the demo
- **WHEN** demo mode is on and `OPENTODO_SMTP_HOST` and `OPENTODO_SMTP_FROM` are set
- **THEN** no message is sent for any action and the authentication status reports `outgoingEmail.enabled: false`

### Requirement: Demo sign-in and banner
With demo mode on, `GET /api/v1/auth/status` SHALL include a `demo` object with a short-lived creation token, the sandbox lifetimes and the next reset, and no credentials. "Try the demo" SHALL create a sandbox and sign the browser into it. Settings SHALL hide or disable restricted controls with a short note.

While signed into a sandbox the app SHALL show a demo banner above the shell that is **one line at every width** from 360 px up, reading "Demo: private sandbox, deleted after {idle} h of inactivity. Don't store anything personal." followed by a "Learn more" link; below 640 px the second sentence is left to the Details control and the rest is cut with an ellipsis rather than wrapped, so the banner never takes a second line. The link SHALL open the demo section of the getting-started guide in the Help panel over the current screen. `{idle}` SHALL be the idle lifetime in hours from the status's `demo.sandboxHours`, remembered on the device so the line is the same offline, never a number fixed in the app. The banner SHALL offer a Dismiss control and a Details control: Dismiss hides the banner on this device until the browser session ends (stored on the device only, never synced, never sent); Details shows the full text (private sandbox, the idle lifetime, the maximum age, the nightly reset, nothing personal) as a tooltip with a fine pointer and as a dialog on touch. While the sandbox's write budget is used up, the line SHALL show the write-limit notice in the banner's place, dismissed or not, and return to the demo line when writes are accepted again. The banner SHALL be a status region for assistive technology and SHALL not be shown in docs screenshots.

#### Scenario: Try the demo
- **WHEN** a visitor clicks "Try the demo"
- **THEN** a new sandbox is created, they are signed into it and see the sample data and the banner

#### Scenario: One line on a phone
- **WHEN** a sandbox is open on a 360 px wide screen
- **THEN** the banner is one line reading "Demo: private sandbox, deleted after 2 h of inactivity." (cut with an ellipsis if it still does not fit) with its Learn more link and its two controls, Details shows the full text, and the first task of the Inbox is two lines higher than before

#### Scenario: Lifetime from the server
- **WHEN** a demo server reports an idle lifetime of 3 hours
- **THEN** the banner reads "deleted after 3 h of inactivity", also after the tab was reopened offline

#### Scenario: Dismissed for the session
- **WHEN** a visitor dismisses the banner, opens another view and reloads the tab
- **THEN** the banner stays hidden; in a new browser session or another browser it is shown again, and nothing was written to the account

#### Scenario: Learn more
- **WHEN** a visitor activates Learn more while editing a task
- **THEN** the demo section of the guide opens in the Help panel beside the screen and the task stays open as it was

#### Scenario: Write limit
- **WHEN** a sandbox that dismissed the banner reaches its write limit
- **THEN** the banner's line shows the write-limit notice until writes are accepted again

#### Scenario: Returning visitor
- **WHEN** a visitor comes back within the sandbox lifetime in the same browser
- **THEN** they are still signed into the same sandbox with their changes

#### Scenario: Restricted control
- **WHEN** a sandbox opens Settings
- **THEN** Import is disabled and restricted sections are replaced by a note saying they are off on the demo

#### Scenario: Status without demo mode
- **WHEN** demo mode is off and the status is requested
- **THEN** the response has no `demo` field and no banner is shown

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
The server SHALL bound demo use: a live-sandbox cap (evict the least recently active idle one, else 503 `demo_busy`), 5 new sandboxes per client address per hour (429), per sandbox 600 ops an hour, 5,000 ops and 2 MB of values in total (429 `demo_limit`), fields of 4 KB (notes 32 KB), and above a database size threshold no new sandboxes and no sandbox writes. The client address SHALL be the last forwarded hop not listed in `OPENTODO_TRUSTED_PROXIES`.

#### Scenario: Write budget
- **WHEN** a sandbox sends its 601st op within an hour
- **THEN** the batch is refused with 429 `demo_limit`, nothing is applied and the app shows a notice while keeping its queue

#### Scenario: Creation flood
- **WHEN** one address requests a sixth sandbox within an hour, even with a different forged leading `X-Forwarded-For` entry each time
- **THEN** the request gets 429 and no account is created

#### Scenario: Behind Cloudflare
- **WHEN** `OPENTODO_TRUSTED_PROXIES=cloudflare` and visitors reach the demo through the same Cloudflare edge
- **THEN** each visitor is counted by its own address (the hop before the edge, or `CF-Connecting-IP` from an edge), not the edge's

#### Scenario: Byte budget
- **WHEN** a sandbox's batch would take its stored values past 2 MB
- **THEN** the batch is refused with 429 `demo_limit` and nothing is applied

#### Scenario: Database full
- **WHEN** the database is above its size threshold and a live sandbox writes
- **THEN** the write is refused with 429 `demo_limit` and nothing is applied

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

### Requirement: Project invite links refused on the demo
With demo mode on, every request to `/api/v1/projects/{id}/invites` and `/api/v1/project-invites` SHALL be refused with 403 `demo_restricted` before authentication, so sandboxes cannot reach each other's projects. The share dialog SHALL not offer invite links there.

#### Scenario: Create refused
- **WHEN** a demo sandbox posts to a project's invites route
- **THEN** the response is 403 `demo_restricted` and no link exists

#### Scenario: Preview refused
- **WHEN** an anonymous client previews a project link on a demo instance
- **THEN** the response is 403 `demo_restricted`

### Requirement: Attachments refused on the demo
With demo mode on, every request to `/api/v1/attachments`, `/api/v1/tasks/{id}/attachments` and `/api/v1/settings/attachments`, for every method, SHALL be refused with 403 `demo_restricted` before authentication, so the public instance never stores or serves visitor files. `GET /api/v1/me` SHALL report `attachments.enabled: false` there and the app SHALL hide every attachment control and the capture screen's file list.

#### Scenario: Upload refused
- **WHEN** a demo sandbox uploads bytes to an attachment's content route
- **THEN** the response is 403 `demo_restricted` and no file is stored

#### Scenario: Controls hidden
- **WHEN** a sandbox opens a task's detail or the capture screen with a shared file
- **THEN** no attachment control is offered and the shared file is dropped with a note that attachments are off on the demo

#### Scenario: Demo mode off
- **WHEN** demo mode is off
- **THEN** the attachment routes behave as on any instance

### Requirement: Calendar feeds refused on the demo
With demo mode on, every request to `/api/v1/calendar-feeds` and `/feeds` SHALL be refused with 403 `demo_restricted` before authentication, so the demo server never fetches a visitor's URL and serves no feed. The Calendar feeds panel SHALL be replaced by a note there.

#### Scenario: Subscription refused
- **WHEN** a demo sandbox posts a calendar subscription
- **THEN** the response is 403 `demo_restricted`, nothing is stored and no outbound request is made

#### Scenario: Feed refused
- **WHEN** any client requests `/feeds/<secret>/tasks.ics` on a demo instance
- **THEN** the response is 403 `demo_restricted`

#### Scenario: Events route refused
- **WHEN** a sandbox reads `/api/v1/calendar-feeds/events`
- **THEN** the response is 403 `demo_restricted` and the Day view shows no calendar toggle

### Requirement: Public links refused on the demo
With demo mode on, every request to `/api/v1/projects/{id}/public-links` and `/api/v1/public` SHALL be refused with 403 `demo_restricted` before authentication, so no sandbox content ever reaches an anonymous visitor. The share dialog SHALL not offer public links there.

#### Scenario: Create refused
- **WHEN** a demo sandbox posts to a project's public-links route
- **THEN** the response is 403 `demo_restricted` and no link exists

#### Scenario: Public read refused
- **WHEN** an anonymous client requests `/api/v1/public/<any secret>` on a demo instance
- **THEN** the response is 403 `demo_restricted`

### Requirement: Issue connections refused on the demo
With demo mode on, every request to `/api/v1/issues` and `/api/v1/settings/issues` SHALL be refused with 403 `demo_restricted` before authentication, so the demo server never contacts a visitor's host with a visitor's token. The Issues panel SHALL be replaced by the demo note there.

#### Scenario: Connection refused
- **WHEN** a demo sandbox posts an issue connection
- **THEN** the response is 403 `demo_restricted`, nothing is stored and no outbound request is made

#### Scenario: Owner switch refused
- **WHEN** any client calls `PUT /api/v1/settings/issues` on a demo instance
- **THEN** the response is 403 `demo_restricted`

#### Scenario: Panel on the demo
- **WHEN** a sandbox opens `/settings/integrations`
- **THEN** the Issues panel is shown under the demo note with disabled controls
