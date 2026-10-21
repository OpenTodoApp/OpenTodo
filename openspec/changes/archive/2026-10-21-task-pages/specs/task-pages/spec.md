## Purpose

Lets a user publish one task as a calm, readable page that people without an account can open, reply to and tick, so a task can be handed to a friend or colleague and every answer comes back to the task. Works for accounts with end-to-end encryption by decrypting the page in the guest's browser with a key that only the link carries.

## ADDED Requirements

### Requirement: Publishing a task page
A user SHALL publish a task through `POST /api/v1/tasks/{id}/page` with `rights` `view`, `reply` or `tick` (`tick` includes replying), an optional `label` (1–40 characters of lowercase letters, digits and hyphens), an optional `expiresInDays` (1–90; absent means no expiry) and an optional `includeMap` (default true). The task's owner may publish a personal task; the owner or an admin of a shared project may publish its tasks; subtasks cannot be published on their own. The secret SHALL carry at least 128 bits of randomness, SHALL be returned once as a link `/t/<secret>` (followed by `/<label>` when a label is set) and SHALL be stored only as a hash. The label is decoration: a page SHALL be found by its secret alone, and a wrong or missing label SHALL still open it. A task SHALL have at most one active page; publishing again SHALL revoke the previous page in the same request. Pages are server-side data, never ops: they never sync, and publishing needs a connection and a fresh session.

#### Scenario: Publish with replies
- **WHEN** the owner of a personal task posts `{"rights":"reply","label":"paint-the-fence","expiresInDays":30}`
- **THEN** the response is 201 with the page's `id`, `rights`, `label`, `expiresAt` and a `link` ending in `/t/<secret>/paint-the-fence` that is never returned again

#### Scenario: Republish replaces the page
- **WHEN** the owner publishes a task that already has an active page
- **THEN** the old link answers 404 `page_invalid` and only the new page is listed for the task

#### Scenario: Wrong label
- **WHEN** a guest opens `/t/<secret>/something-else`
- **THEN** the page opens as with the correct label

#### Scenario: Not allowed to publish
- **WHEN** an editor or viewer of a shared project posts to the route for one of its tasks, or a stranger posts for any task
- **THEN** the editor or viewer gets 403 `forbidden`, the stranger 404 `not_found`, and no page exists

#### Scenario: Subtask
- **WHEN** the owner posts to the route for a subtask
- **THEN** the response is 400 `invalid_input` naming the task, and no page exists

#### Scenario: Anonymous or limited token
- **WHEN** a request without credentials, or with a `read` or `agent` API token, posts to the route
- **THEN** the response is 401 `unauthorized` or 403 `insufficient_scope` and no page exists

#### Scenario: Invalid input
- **WHEN** the body has unknown `rights`, a `label` with spaces or capitals or longer than 40 characters, or `expiresInDays` outside 1–90
- **THEN** the response is 400 `invalid_input` naming the field

#### Scenario: Demo instance
- **WHEN** a visitor on a demo instance publishes a task
- **THEN** the response is 403 `demo_restricted` and no page exists

### Requirement: Page status and revocation
The publisher, and the owner and admins of a shared project, SHALL read a task's active page through `GET /api/v1/tasks/{id}/page` (id, rights, label, creator, creation and expiry times, `lastOpenedAt`, the number of guest replies and ticks; never the secret or a key) and revoke it through `DELETE /api/v1/tasks/{id}/page`. Revocation takes effect on the server at once and deletes any stored snapshot and pending replies; no device holds pages, so nothing has to converge.

#### Scenario: Status
- **WHEN** the owner reads the page status after a guest replied twice
- **THEN** the response carries the rights, label, expiry, `lastOpenedAt` and `replies: 2`, and no secret

#### Scenario: Revoke
- **WHEN** the owner deletes the page and a guest reloads it
- **THEN** the delete returned 204 and the page says it is no longer available

#### Scenario: No page
- **WHEN** the status is read or the page deleted for a task without an active page, or by an editor
- **THEN** the first answers 404 `not_found`, the editor 403 `forbidden`, and nothing changes

#### Scenario: Anonymous
- **WHEN** a request without credentials reads or deletes a task's page
- **THEN** the response is 401 `unauthorized`

### Requirement: Publishing from the task panel
The task panel's menu SHALL offer "Publish task page…", reachable by keyboard, to the users allowed to publish. Its dialog SHALL offer what guests may do ("Read", "Reply", "Reply and tick"), an optional label prefilled from the title, an expiry (never, 7, 30 or 90 days) and "Show the map" when the task has a location, then show the link once with a copy button and a notice that it will not be shown again and that anyone with the link can open the page. While a page is active and the device is online, the panel header SHALL show a "Published" marker that opens the page's status with "Copy a new link" (republish), "Revoke" and the reply count. The comment composer of a published task SHALL say that new comments are visible on the page. Offline, publishing and revoking SHALL be disabled with an explanation; the marker comes from the server and is absent offline.

#### Scenario: Publish and copy
- **WHEN** the owner chooses "Publish task page…", picks "Reply and tick" and publishes
- **THEN** the link is shown with a copy button and the one-time notice, and the panel header shows "Published"

#### Scenario: Keyboard only
- **WHEN** the owner opens the panel menu with the keyboard, publishes, copies the link and closes the dialog without a pointer
- **THEN** every step is reachable with Tab, Enter and Escape and focus returns to the menu button

#### Scenario: Composer notice
- **WHEN** a member opens the comment composer of a published task
- **THEN** the composer says that comments written from now on are visible on the task page

#### Scenario: Offline
- **WHEN** the panel is opened without a connection
- **THEN** "Publish task page…" is disabled with "Task pages need a connection" and no marker is shown

### Requirement: What a task page shows
`GET /api/v1/pages/{secret}` SHALL need no authentication and no cookie. For a task the server can read, it SHALL return the task's title, description (Markdown), due date and time, deadline, completion state, its subtasks (id, title, completion, depth up to three levels), link attachments, file attachments as names that download through the page (`GET /api/v1/pages/{secret}/files/{fileId}`, always as a download), the location when `includeMap` is set and maps are on (OpenSpec change `task-locations`; the map's style, tiles, fonts and sprites come through `GET /api/v1/pages/{secret}/maps/…`, the same proxy without a sign-in), the comments created since the page was published (body, display name of the member or the guest's typed name, time), the rights and the server time. It SHALL serve no labels, project, notes document, assignee, member emails or account ids, and no comment older than the page. It reads the server's materialised state; nothing is stored on the guest's device except the typed name.

#### Scenario: Live page
- **WHEN** a guest requests the route of a page for an unencrypted task with three subtasks and a comment written before publishing
- **THEN** the response is 200 with the title, the description, the three subtasks, `rights`, `serverTime`, no comments, and no `Set-Cookie` header

#### Scenario: Conversation after publishing
- **WHEN** the owner comments on the task after publishing it and the guest reloads
- **THEN** the comment appears on the page with the owner's display name

#### Scenario: Invalid page
- **WHEN** the secret is unknown, revoked or expired
- **THEN** the response is 404 `page_invalid` with the same shape in every case

#### Scenario: Session ignored
- **WHEN** a signed-in user opens a page with their session cookie
- **THEN** the response is the same as for an anonymous guest

### Requirement: The task page
Opening `/t/<secret>` SHALL show, without sign-in, a page built for reading: the title as the heading, the dates in plain words, the description as formatted text, the subtasks as a checklist, the attachments, the map when served, the conversation and, for the rights given, a reply box and "Mark as done". A notice SHALL say that anyone with the link can open the page. It SHALL keep no local copy, refresh every 30 seconds while visible and after each action, show when it last updated, and say when the server cannot be reached or the page is no longer available. It SHALL be usable at 360 px without horizontal scrolling, with touch targets of at least 44×44 px, entirely by keyboard, with the structure announced to screen readers, in light and dark following the system, and in the guest's browser language among the app's languages.

#### Scenario: Phone
- **WHEN** a guest opens a reply-and-tick page on a 360 px wide phone
- **THEN** the title, notice, subtasks and reply box fit the width, and every checkbox is at least 44×44 px

#### Scenario: Read-only page
- **WHEN** a guest opens a page published with "Read"
- **THEN** there is no reply box and no checkbox, and the notice says the page is read-only

#### Scenario: Keyboard
- **WHEN** a guest tabs to a subtask and presses Space
- **THEN** the subtask is ticked and focus stays on it

#### Scenario: Offline
- **WHEN** the guest's device loses its connection
- **THEN** the page keeps the last content, says it could not refresh, disables replying and ticking, and retries when the network returns

#### Scenario: Task completed
- **WHEN** the task is completed by its owner and the guest reloads
- **THEN** the page shows the task as done, and with tick rights offers "Reopen" for 24 hours

### Requirement: Guests name themselves
A guest SHALL reply and tick under a name they type once (1–40 characters), kept only in that browser for that page and changeable on the page. The name is not verified and SHALL be shown everywhere as the name followed by "(guest)". No account, cookie or email is created or asked for.

#### Scenario: First reply
- **WHEN** a guest writes a reply without having given a name
- **THEN** the page asks for a name first and sends the reply after it is entered

#### Scenario: Same browser later
- **WHEN** the guest reopens the page a day later in the same browser
- **THEN** the name is remembered and shown with a "Change" control

#### Scenario: Name shown to members
- **WHEN** a guest named Marco replies
- **THEN** members see the comment by "Marco (guest)" with a mark that it came through the task page

### Requirement: Guest replies become comments
`POST /api/v1/pages/{secret}/replies` with `{name, body}` (body 1–4000 characters of plain text, rendered as Markdown without images) SHALL, for a page with reply rights on a task the server can read, write a comment on the task as operations authored by the publisher with device `page:<page-id>`, the guest's name in `guest_name`, the page id in `page_id` and server time, through the same path as an API write. Devices receive it on their next sync, it converges like any comment, and the members' devices are woken. A guest SHALL NOT edit or delete a reply after sending it; the task's owner and the project's admins can delete it as any comment.

#### Scenario: Reply
- **WHEN** a guest posts `{"name":"Marco","body":"Done the first coat, need more paint"}`
- **THEN** the response is 201, the task has the comment by "Marco (guest)" on every member device after its next sync, and the stored op carries device `page:<page-id>`

#### Scenario: Read-only page
- **WHEN** a guest posts a reply to a page with `view` rights
- **THEN** the response is 403 `forbidden` and nothing is written

#### Scenario: Invalid reply
- **WHEN** the body is empty or longer than 4000 characters, or the name is missing or longer than 40 characters
- **THEN** the response is 400 `invalid_input` naming the field and nothing is written

#### Scenario: Invalid page
- **WHEN** the secret is unknown, revoked or expired
- **THEN** the response is 404 `page_invalid` and nothing is written

### Requirement: Guest ticks
`POST /api/v1/pages/{secret}/tick` with `{taskId, completed, name}` SHALL, for a page with tick rights, complete or reopen the published task or one of its subtasks as operations authored by the publisher with device `page:<page-id>` and server time. Reopening SHALL be allowed for 24 hours after completion. A recurring task SHALL complete its occurrence as an API completion does. Concurrent edits converge by last-writer-wins. Ticks need no access to the task's content, so they work the same for encrypted tasks.

#### Scenario: Tick a subtask
- **WHEN** a guest ticks the subtask "Buy primer"
- **THEN** the response is 200 with its `completed_at`, and every member device shows it ticked after its next sync

#### Scenario: Mark the task done
- **WHEN** a guest chooses "Mark as done" on a page with tick rights
- **THEN** the task is completed, attributed to the guest through the page, and the publisher is notified

#### Scenario: Task outside the page
- **WHEN** the body names a task that is not the published task or one of its subtasks
- **THEN** the response is 404 `not_found` and nothing changes

#### Scenario: Reply-only page
- **WHEN** a guest posts a tick to a page with `reply` rights
- **THEN** the response is 403 `forbidden` and nothing changes

#### Scenario: Concurrent edit
- **WHEN** a guest completes the task while its owner, offline, changes its due date, and the owner syncs afterwards
- **THEN** every device shows the task completed with the new due date

### Requirement: Task page activity is attributed and notified
A change written through a task page SHALL be attributed to the page and the guest's name wherever changes are shown: the task's history and activity label it "<name> (guest, task page)" and never fold it into the publisher's own events. Each guest reply and each completion or reopening of the published task SHALL create an in-app notification for the publisher, and a push notification when push is on; for an encrypted task the notification names no content ("New reply on your task page") and the device shows the task title once it decrypts it.

#### Scenario: History
- **WHEN** a guest named Marco ticks a subtask and the owner opens the task's history
- **THEN** the change is labelled "Marco (guest, task page)"

#### Scenario: Notification
- **WHEN** a guest replies on a page
- **THEN** the publisher's notifications show "Marco replied on <task title>", opening the task's comments

#### Scenario: Encrypted task notification
- **WHEN** a guest replies on the page of an encrypted task
- **THEN** the server-side notification carries no title or body, and the publisher's unlocked device shows the title

### Requirement: Encrypted task pages
For a task the server holds only as ciphertext, publishing SHALL be done by the publisher's unlocked device: it SHALL create a random 256-bit share key for the page (never derived from or equal to the account key), encrypt a snapshot of what the page shows with it, upload the ciphertext and the share key wrapped with the account key (both opaque to the server) with the publish request, and append the share key to the link after `#`. The fragment SHALL never be sent to the server. The guest's browser SHALL decrypt the snapshot and SHALL encrypt replies with the share key; the server stores replies as pending ciphertext. Every unlocked, online device of the publisher SHALL import pending replies as comments (comment id derived from the reply id, so concurrent imports converge on one comment) and confirm them, and SHALL re-upload the snapshot within a minute of syncing a change to what the page shows. The page shows when the snapshot was last updated.

#### Scenario: Publish an encrypted task
- **WHEN** an encrypted account publishes a personal task
- **THEN** the server stores only ciphertext and a wrapped key, the copied link ends in `#<share key>`, and the server never receives the share key in any request

#### Scenario: Guest opens it
- **WHEN** a guest opens the link with its fragment
- **THEN** the browser decrypts and shows the title, description and subtasks

#### Scenario: Fragment missing or altered
- **WHEN** a guest opens the link without the part after `#` or with a changed one
- **THEN** the page says it cannot be opened without the full link and shows no content

#### Scenario: Encrypted reply
- **WHEN** a guest replies on an encrypted page and the publisher's phone is unlocked and online
- **THEN** the server stored only ciphertext, the phone imports it as a comment by "Marco (guest)" encrypted with the account key, and the pending reply is deleted

#### Scenario: Two devices import at once
- **WHEN** the publisher's laptop and phone import the same pending reply at the same time
- **THEN** both write the same comment id and every device shows one comment

#### Scenario: Owner edits the description offline
- **WHEN** the owner edits the description offline and reconnects
- **THEN** the device syncs the change and re-uploads the snapshot, and the guest sees the new description on the next refresh

### Requirement: Task page lifecycle
Every request to a page SHALL re-check it against current state. A page SHALL answer 404 `page_invalid` when it is revoked or expired; when its task is deleted or its project deleted or archived; when the publisher is deactivated or no longer may publish the task (moved into a project where they are not owner or admin); and, for an encrypted task, until a snapshot exists. Restoring the condition (the task from the Trash, the project unarchived) makes it work again unless it was revoked. When a task moves between an encrypted personal scope and a shared, unencrypted project, the page SHALL switch between snapshot and live serving: on entering an encrypted scope it stays unavailable until the publisher's device uploads a snapshot; on leaving it the snapshot and wrapped key are deleted.

#### Scenario: Task deleted and restored
- **WHEN** the task is moved to the Trash, a guest opens the page, the task is restored and the guest reloads
- **THEN** the first request answers 404 `page_invalid` and the second 200

#### Scenario: Moved where the publisher is an editor
- **WHEN** the owner moves a published task into a shared project where they are an editor
- **THEN** the page answers 404 `page_invalid`

#### Scenario: Expiry
- **WHEN** a page published with `expiresInDays: 7` is opened on the eighth day
- **THEN** it answers 404 `page_invalid` and the page says it has expired

### Requirement: Task pages are private and not indexed
Every response under `/api/v1/pages/` and the page at `/t/` SHALL carry `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, SHALL set no cookie, and SHALL load scripts, styles, fonts and images only from the server itself (map tiles through the server, OpenSpec change `task-locations`). Links in the description and replies SHALL open in a new tab without a referrer. Secrets and share keys SHALL never be logged or audited.

#### Scenario: Headers
- **WHEN** a client requests `/t/<secret>` or `/api/v1/pages/<secret>`
- **THEN** both responses carry the three headers and no `Set-Cookie`

#### Scenario: No third-party request
- **WHEN** a guest opens a page with a map and a description containing an external link
- **THEN** the browser makes no request to another host until the guest follows the link, which opens without a referrer

#### Scenario: Request log
- **WHEN** a page route is called
- **THEN** the server log records the path with the secret redacted

### Requirement: Task page limits
Requests with a valid secret SHALL be limited per page (120 reads and 60 ticks per minute, 20 replies per hour) and per client address (120 requests per minute); requests with an unknown secret SHALL be charged to the per-address sign-in limiter. An account SHALL have at most 100 active pages and publish at most 20 per hour. Exceeding a limit SHALL answer 429 `rate_limited` and write nothing.

#### Scenario: Reply flood
- **WHEN** a page receives its 21st reply within an hour
- **THEN** the response is 429 `rate_limited` and no comment is written

#### Scenario: Guessing pages
- **WHEN** one address sends 11 requests with unknown secrets within a minute
- **THEN** the 11th answers 429 `rate_limited`, and so do that address's sign-in attempts in the same window

#### Scenario: Too many pages
- **WHEN** an account with 100 active pages publishes another
- **THEN** the response is 409 `limit_reached` and no page is created

### Requirement: Snapshot and pending reply routes
For an encrypted page, the publisher's devices SHALL find their pages and the wrapped share keys through `GET /api/v1/task-pages` (the caller's own active pages only), upload a new snapshot through `PUT /api/v1/tasks/{id}/page/snapshot` (`{ciphertext, version}`, with `wrappedKey` for the first snapshot of a page whose task moved into an encrypted scope; at most 256 KB; a version not greater than the stored one is ignored, so concurrent uploads converge on the newest), list pending replies through `GET /api/v1/tasks/{id}/page/replies` and confirm an imported one through `DELETE /api/v1/tasks/{id}/page/replies/{replyId}`. These routes need the publisher's session or a `full` token. A guest SHALL post an encrypted reply to `POST /api/v1/pages/{secret}/replies` as `{ciphertext}` (at most 16 KB) instead of `{name, body}`; the server never sees the name or the body.

#### Scenario: Newer snapshot wins
- **WHEN** the laptop uploads version 5 and the phone, a moment later, uploads version 4
- **THEN** the stored snapshot is version 5 and the phone's upload answers 200 without changing it

#### Scenario: Pending replies listed and confirmed
- **WHEN** the publisher's device lists pending replies, imports one and deletes it
- **THEN** the list held one reply with its id and ciphertext, the delete answers 204, and a second list is empty

#### Scenario: Not the publisher
- **WHEN** another account, a `read` token or a request without credentials calls the snapshot or replies routes
- **THEN** the other account gets 404 `not_found`, the `read` token 403 `insufficient_scope`, the anonymous request 401 `unauthorized`, and nothing changes

#### Scenario: Invalid snapshot or reply
- **WHEN** a snapshot is larger than 256 KB, a guest's encrypted reply larger than 16 KB, or a snapshot is uploaded for a task whose page is served live
- **THEN** the response is 400 `invalid_input` (409 `page_not_encrypted` for the live page) and nothing is stored
