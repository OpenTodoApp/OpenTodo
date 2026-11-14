## ADDED Requirements

### Requirement: Publishing a note page
A user SHALL publish a standalone note through `POST /api/v1/notes/{id}/page` with an optional `label` (1–40 characters of lowercase letters, digits and hyphens) and an optional `expiresInDays` (1–90; absent means no expiry). The author of a personal note may publish it; the owner or an admin of a shared project may publish its notes. The secret SHALL carry at least 128 bits of randomness, SHALL be returned once as a link `/n/<secret>` (followed by `/<label>` when set) and SHALL be stored only as a hash; a wrong or missing label SHALL still open the page. A note SHALL have at most one active page; publishing again SHALL revoke the previous one in the same request. A note page SHALL be read-only. Pages are server-side data, never ops: they never sync, and publishing needs a connection and a fresh session. The route SHALL need a session or a `full` token and SHALL be refused on a demo instance.

#### Scenario: Publish
- **WHEN** the author of the personal note "Wi-Fi for guests" posts `{"label":"wifi","expiresInDays":30}`
- **THEN** the response is 201 with the page's `id`, `label`, `expiresAt` and a `link` ending in `/n/<secret>/wifi` that is never returned again

#### Scenario: Republish replaces the page
- **WHEN** the author publishes a note that already has an active page
- **THEN** the old link answers 404 `page_invalid` and only the new page is listed for the note

#### Scenario: Not allowed to publish
- **WHEN** an editor or viewer of a shared project posts to the route for one of its notes, or a stranger posts for any note
- **THEN** the editor or viewer gets 403 `forbidden`, the stranger 404 `not_found`, and no page exists

#### Scenario: Anonymous or limited token
- **WHEN** a request without credentials, or with a `read` or `agent` API token, posts to the route
- **THEN** the response is 401 `unauthorized` or 403 `insufficient_scope` and no page exists

#### Scenario: Invalid input
- **WHEN** the body has a `label` with spaces or capitals or longer than 40 characters, `expiresInDays` outside 1–90, or a `rights` member
- **THEN** the response is 400 `invalid_input` naming the field

#### Scenario: Demo instance
- **WHEN** a visitor on a demo instance publishes a note
- **THEN** the response is 403 `demo_restricted` and no page exists

### Requirement: Note page status and revocation
The publisher, and the owner and admins of a shared project, SHALL read a note's active page through `GET /api/v1/notes/{id}/page` (id, label, creator, creation and expiry times, `lastOpenedAt`; never the secret or a key) and revoke it through `DELETE /api/v1/notes/{id}/page`, effective on the server at once and deleting any stored snapshot. No device holds pages, so nothing has to converge.

#### Scenario: Revoke
- **WHEN** the author deletes the page and a guest reloads it
- **THEN** the delete returned 204 and the page says it is no longer available

#### Scenario: No page or not allowed
- **WHEN** the status is read or the page deleted for a note without an active page, or by an editor of its project
- **THEN** the first answers 404 `not_found`, the editor 403 `forbidden`, and nothing changes

#### Scenario: Anonymous
- **WHEN** a request without credentials reads or deletes a note's page
- **THEN** the response is 401 `unauthorized`

### Requirement: What a note page shows
`GET /api/v1/pages/{secret}` SHALL need no authentication and no cookie, and for a note page SHALL answer `kind: "note"` with the note's title, its Markdown text, the time its text last changed, its live attachments (images on the inline allow-list served inline and every other file as a download through `GET /api/v1/pages/{secret}/files/{fileId}`) and the server time. Links to notes, tasks and projects in the text SHALL be served as their text with the target removed. It SHALL serve no labels, project, author email, account ids, Linked references or other item. It reads the server's materialised state, so a guest sees the note as last synced.

#### Scenario: Live page
- **WHEN** a guest requests the route for an unencrypted note with an embedded photo
- **THEN** the response is 200 with `kind: "note"`, the title, the text, the photo listed, `serverTime`, and no `Set-Cookie` header

#### Scenario: Link to another note
- **WHEN** the note's text holds `[Door code](?note=<id>)`
- **THEN** the page's text reads "Door code" as plain text and the response contains no id of that note

#### Scenario: Edited after publishing
- **WHEN** the author edits the note offline, reconnects, and the guest reloads
- **THEN** the guest sees the new text once the device has synced

#### Scenario: Invalid page
- **WHEN** the secret is unknown, revoked or expired
- **THEN** the response is 404 `page_invalid` with the same shape as for task pages

### Requirement: The note page
Opening `/n/<secret>` SHALL show, without sign-in, a page built for reading: the title as the heading, when it last changed in plain words, the text formatted with its checklists shown but not tickable, the images in place and the files as downloads, and a notice that anyone with the link can read it. It SHALL keep no local copy, refresh every 60 seconds while visible, say when the server cannot be reached or the page is no longer available, and be usable at 360 px without horizontal scrolling, entirely by keyboard, announced to screen readers, in light and dark following the system and in the guest's browser language among the app's languages. Its responses SHALL carry the headers of `task-pages` "Task pages are private and not indexed" and SHALL load nothing from another host.

#### Scenario: Phone
- **WHEN** a guest opens a note page with a wide photo on a 360 px phone
- **THEN** the title, notice, text and photo fit the width without horizontal scrolling

#### Scenario: Headers
- **WHEN** a client requests `/n/<secret>` or its API route
- **THEN** both responses carry `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, and no `Set-Cookie`

#### Scenario: Offline guest
- **WHEN** the guest's device loses its connection
- **THEN** the page keeps the last content, says it could not refresh, and retries when the network returns

### Requirement: Publishing from a note
A standalone note's menu SHALL offer "Publish note page…", reachable by keyboard, to the users allowed to publish. Its dialog SHALL offer an optional label prefilled from the title and an expiry (never, 7, 30 or 90 days), then show the link once with a copy button and a notice that it will not be shown again and that anyone with the link can read the note. While a page is active and the device is online, the note's header SHALL show a "Published" marker that opens the status with "Copy a new link", "Revoke" and when it was last opened. Offline, publishing and revoking SHALL be disabled with an explanation, and the marker is absent.

#### Scenario: Publish and copy
- **WHEN** the author chooses "Publish note page…" on "Babysitter how-to" and publishes
- **THEN** the link is shown with a copy button and the one-time notice, and the note's header shows "Published"

#### Scenario: Keyboard only
- **WHEN** the author opens the note menu with the keyboard, publishes, copies the link and closes the dialog
- **THEN** every step is reachable with Tab, Enter and Escape and focus returns to the menu button

#### Scenario: Offline
- **WHEN** the note is opened without a connection
- **THEN** "Publish note page…" is disabled with "Note pages need a connection" and no marker is shown

### Requirement: Encrypted note pages
For a note the server holds only as ciphertext, publishing SHALL be done by the publisher's unlocked device as `task-pages` "Encrypted task pages" states: a random 256-bit share key, a snapshot of the title, the text and its change time encrypted with it, the share key wrapped with the account key, both opaque to the server, and the share key appended to the link after `#`, never sent to the server. Every unlocked, online device of the publisher SHALL re-upload the snapshot within a minute of syncing a change to the note, through `PUT /api/v1/notes/{id}/page/snapshot` (`{ciphertext, version}`, at most 256 KB, a version not greater than the stored one ignored, so concurrent uploads converge on the newest), which needs the publisher's session or a `full` token. Images and files SHALL be left out of an encrypted page, and the page SHALL say so.

#### Scenario: Guest opens an encrypted note page
- **WHEN** a guest opens the link of an encrypted account's note with its fragment
- **THEN** the browser decrypts and shows the title and text, with "Images and files are not shown on encrypted pages" where the note had them

#### Scenario: Fragment missing
- **WHEN** a guest opens the link without the part after `#`
- **THEN** the page says it cannot be opened without the full link and shows no content

#### Scenario: Newer snapshot wins
- **WHEN** the laptop uploads version 5 and the phone, a moment later, uploads version 4
- **THEN** the stored snapshot is version 5 and the phone's upload answers 200 without changing it

#### Scenario: Not the publisher
- **WHEN** another account, a `read` token or a request without credentials calls the snapshot route
- **THEN** the other account gets 404 `not_found`, the `read` token 403 `insufficient_scope`, the anonymous request 401 `unauthorized`, and nothing changes

#### Scenario: Snapshot too large
- **WHEN** a snapshot larger than 256 KB is uploaded, or a snapshot for a note whose page is served live
- **THEN** the response is 400 `invalid_input` (409 `page_not_encrypted` for the live page) and nothing is stored

### Requirement: Note page lifecycle and limits
Every request to a note page SHALL re-check it: it SHALL answer 404 `page_invalid` when revoked or expired, when the note is in the Trash or purged, when its project is deleted or archived, when the publisher is deactivated or no longer may publish it, and for an encrypted note until a snapshot exists. Restoring the condition SHALL make it work again unless it was revoked. A note moved across sharing scopes is a copy of a new id, so the original's page SHALL go invalid with it. Note pages SHALL share the task page limits: per page 120 reads per minute, per client address 120 requests per minute, unknown secrets charged to the sign-in limiter, and per account at most 100 active pages and 20 publishes per hour across task and note pages; beyond a limit the answer SHALL be 429 `rate_limited` (409 `limit_reached` for the active pages) and nothing is written. Secrets and share keys SHALL never be logged or audited.

#### Scenario: Note in the Trash and back
- **WHEN** the note is moved to the Trash, a guest opens the page, the note is restored and the guest reloads
- **THEN** the first request answers 404 `page_invalid` and the second 200

#### Scenario: Shared limit
- **WHEN** an account with 99 active task pages and 1 active note page publishes another note
- **THEN** the response is 409 `limit_reached` and no page is created

#### Scenario: Moved into a shared project
- **WHEN** the author moves a published personal note into a project shared with others
- **THEN** the old link answers 404 `page_invalid` and the copy in the shared project has no page
