# attachments Specification

## Purpose
Lets people keep files, images and links on tasks and comments: how attachment metadata is stored and synced, where the bytes live and within what limits, how they are uploaded, served and removed securely, and how all of it works offline and converges.

## Requirements

### Requirement: Attachment entity
An attachment SHALL belong to one task and optionally to one comment of that task, and SHALL have a name, a media type, a size in bytes, a digest of the stored bytes, an author, a creation time, an optional removal time and an optional link. Metadata SHALL be stored and synced as operations in the scope of its task, created offline and converging by per-field last-writer-wins; file bytes SHALL never travel through the operation log.

#### Scenario: Attach offline
- **WHEN** a user adds a photo to a task while offline and reconnects later
- **THEN** the attachment is listed on the task at once on that device, and on every device that can see the task after their next sync, with the same id, name, size and author

#### Scenario: Concurrent rename
- **WHEN** two devices rename the same attachment offline and both sync
- **THEN** every device shows the name written with the greater timestamp, and no attachment is duplicated

#### Scenario: Invalid metadata
- **WHEN** a device submits an attachment whose size is not a number, whose name is empty, or whose task is not in a scope the author can read
- **THEN** the batch is refused as invalid or the operation is rejected, and nothing is stored

### Requirement: Link attachments
An attachment MAY carry a link instead of a file. A link attachment SHALL have an `http` or `https` URL, no stored bytes, size zero, SHALL not count toward any quota, and SHALL be shown as a link that opens in a new tab without referrer. Link metadata syncs and converges like every other attachment field.

#### Scenario: Attach a link
- **WHEN** a user attaches `https://example.org/spec.pdf` to a task
- **THEN** the task lists a link attachment named after the URL's last path segment, opening in a new tab with `rel="noopener noreferrer"`

#### Scenario: Unsafe scheme
- **WHEN** a device submits a link attachment whose URL scheme is `javascript`
- **THEN** the operation is rejected as invalid and nothing is stored

### Requirement: Authorship and permissions
Any account that can read a task SHALL be able to attach to it, viewers included. The author SHALL be the submitting account, set at creation; the task, comment, size, digest, link and creation time SHALL be immutable after creation; only the author SHALL rename; the author, project admins and the owner SHALL be able to remove. The server SHALL check these rules per operation at receipt, so refused writes change nothing on any device.

#### Scenario: Viewer attaches
- **WHEN** a viewer of a shared project attaches a file to one of its tasks
- **THEN** the attachment is accepted and visible to every member after sync

#### Scenario: Forged author
- **WHEN** a device submits an attachment whose author names another account
- **THEN** the operation is rejected with reason `forbidden` and nothing is stored

#### Scenario: Rename by someone else
- **WHEN** an editor submits a new name for an attachment another member added
- **THEN** the operation is rejected with reason `forbidden` and the name is unchanged everywhere

#### Scenario: Admin removes
- **WHEN** a project admin removes an attachment a member added
- **THEN** the removal is accepted and the attachment disappears from every member's devices after sync

### Requirement: Attachments on comments
An attachment MAY name a comment of the same task, in which case only that comment's author SHALL be able to add it and it SHALL be shown with the comment. Attachments of a deleted comment SHALL not be shown. Comment attachments sync, work offline and converge like task attachments.

#### Scenario: Attach to own comment
- **WHEN** a member attaches a file while writing a comment and posts it
- **THEN** the comment and its attachment are created in one batch and shown together on every member's devices after sync

#### Scenario: Attach to someone else's comment
- **WHEN** a device submits an attachment naming a comment written by another account
- **THEN** the operation is rejected with reason `forbidden`

#### Scenario: Comment deleted
- **WHEN** the author deletes a comment that carries two attachments
- **THEN** the attachments are no longer shown on any device; the files stay until the comment's task is purged or the attachments are removed

### Requirement: File store under the data directory
File bytes SHALL be stored as one immutable file per attachment under the data directory, written through a temporary file and renamed into place, so an interrupted upload never leaves a partial file under a final name. Reads and writes SHALL stream with bounded buffers, so memory use does not grow with file size. The file store holds no secrets and is part of what backing up the data directory covers.

#### Scenario: Interrupted upload
- **WHEN** a connection drops halfway through an upload
- **THEN** no file exists for the attachment, the metadata still reports it as not uploaded, and the device retries on its next sync

#### Scenario: Large file, small memory
- **WHEN** a 500 MB file is uploaded and then downloaded on a server limited to 128 MB of memory
- **THEN** both transfers complete without the process memory growing with the file

### Requirement: Upload of file bytes
`PUT /api/v1/attachments/{id}/content` SHALL accept the raw bytes of an attachment whose metadata the caller created, as a streamed request body, verify the byte count against the stored size and the digest against the stored digest, and store the file. It SHALL require authentication, SHALL refuse a second upload, and SHALL enforce the per-file limit and the account quota before reading the body when the length is known.

#### Scenario: Upload after sync
- **WHEN** a device has synced an attachment's metadata and uploads matching bytes
- **THEN** the response is 204, the file is stored, and the attachment's `uploaded_at` is set

#### Scenario: Anonymous request
- **WHEN** a request without credentials sends bytes to the content route
- **THEN** the response is 401 `unauthorized` and nothing is stored

#### Scenario: Digest mismatch
- **WHEN** the uploaded bytes do not hash to the stored digest or their count differs from the stored size
- **THEN** the response is 400 `attachment_mismatch`, the temporary file is removed and the attachment stays not uploaded

#### Scenario: Not the author or unknown
- **WHEN** an account uploads bytes for an attachment it did not create, or for an id that does not exist in a scope it can see
- **THEN** the response is 404 `not_found` and nothing is stored

#### Scenario: Already uploaded
- **WHEN** bytes are uploaded for an attachment that already has its file
- **THEN** the response is 409 `already_uploaded` and the stored file is unchanged

### Requirement: Upload confirmation is server-authoritative
`uploaded_at` SHALL be written only by the server, as an operation with device `server`, once the file is stored, so every device learns through ordinary sync that the bytes are available. The server's operation SHALL carry a timestamp greater than the field's current winning timestamp, so it wins whatever clock the device that created the row had; an upload whose confirmation could not be recorded SHALL NOT answer success. `/api/v1/sync` SHALL refuse submitted operations whose device is `server`, and the server SHALL reject any device-written `uploaded_at`. Until it is set, clients show the attachment as uploading and offer no download.

#### Scenario: Other device sees availability
- **WHEN** a phone uploads a file and a laptop syncs afterwards
- **THEN** the laptop shows the attachment as available and can open it

#### Scenario: Device clock ahead
- **WHEN** a phone whose clock runs 90 seconds ahead of the server creates an attachment and uploads its bytes
- **THEN** the response is 204, the attachment is listed as uploaded, and the phone itself receives `uploaded_at` on its next sync

#### Scenario: Forged confirmation
- **WHEN** a device submits an `uploaded_at` operation, or any operation with device `server`
- **THEN** the sync request is refused with 400 `invalid_op` or the operation is rejected, and the attachment stays not uploaded

### Requirement: Create through the API
`POST /api/v1/tasks/{id}/attachments` SHALL create an attachment in one request: a multipart body with a `file` part (and an optional `comment_id` field) stores the bytes and writes the metadata operations as the caller with device `server`; a JSON body `{name?, url}` creates a link attachment. It SHALL require authentication, apply the same limits and permissions as the two-step path, honour `Idempotency-Key`, and return 201 with the attachment.

#### Scenario: Script attaches a file
- **WHEN** a script posts a multipart body with a 2 MB PDF to a task it can read, with a bearer token of scope `full`
- **THEN** the response is 201 with the attachment's id, name, type, size, digest and `uploaded_at`, and devices receive it on their next sync

#### Scenario: Anonymous request
- **WHEN** a request without credentials posts to the route
- **THEN** the response is 401 `unauthorized`

#### Scenario: Read token
- **WHEN** a `read` or `agent` token posts to the route
- **THEN** the response is 403 `insufficient_scope` and nothing is stored

#### Scenario: Too large
- **WHEN** the file part exceeds the per-file limit
- **THEN** the response is 413 `attachment_too_large` naming the limit and nothing is stored

#### Scenario: Unreadable task
- **WHEN** an authenticated user posts to a task in a project they are not a member of
- **THEN** the response is 404 `not_found`

### Requirement: List, rename and remove routes
`GET /api/v1/tasks/{id}/attachments` SHALL return the task's non-removed attachments in creation order with their upload state; `PATCH /api/v1/attachments/{id}` SHALL accept `{name}`; `DELETE /api/v1/attachments/{id}` SHALL set the removal time. Writes go through the operation log as the caller and converge with device edits by last-writer-wins. All three SHALL require authentication and apply the authorship rules.

#### Scenario: List
- **WHEN** a member lists the attachments of a task with two files and one removed attachment
- **THEN** the response holds the two files, each with `uploaded` true or false, and not the removed one

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches any of the three routes
- **THEN** the response is 401 `unauthorized`

#### Scenario: Rename by a non-author
- **WHEN** an editor patches the name of an attachment another member added
- **THEN** the response is 403 `forbidden` and the name is unchanged

#### Scenario: Unknown attachment
- **WHEN** an authenticated user deletes an id that does not exist in a scope they can see
- **THEN** the response is 404 `not_found`

### Requirement: Download
`GET /api/v1/attachments/{id}/content` SHALL stream the stored bytes of an attachment the caller can read, support range requests, send the stored size, a strong validator derived from the digest and `Cache-Control: private, max-age=31536000, immutable` (the bytes never change). It SHALL require a session or token and SHALL not reveal whether an unreadable id exists.

#### Scenario: Member downloads
- **WHEN** a viewer of a shared project requests the content of an uploaded attachment of one of its tasks
- **THEN** the response is 200 with the bytes, their length, a validator and the headers of the safe-serving requirement

#### Scenario: Anonymous request
- **WHEN** a request without credentials asks for an attachment's content
- **THEN** the response is 401 `unauthorized`

#### Scenario: Not uploaded or unreadable
- **WHEN** the attachment has no stored file yet, is removed, or belongs to a scope the caller cannot see
- **THEN** the response is 404 `not_found` in every case

#### Scenario: Range request
- **WHEN** a video player requests bytes 0–1048575 of a 40 MB attachment
- **THEN** the response is 206 with exactly that range

### Requirement: Downloads are served safely
Every content response SHALL carry `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` and a `Content-Disposition` with the attachment's name. The media type SHALL be the stored type only when it is on the inline allow-list (raster images, PDF, plain text, audio, video); every other type, SVG included, SHALL be served as `application/octet-stream` with disposition `attachment`. Encrypted bytes are always `application/octet-stream`.

#### Scenario: HTML upload cannot run
- **WHEN** an attachment named `page.html` of type `text/html` is downloaded and opened in a tab
- **THEN** it is delivered as `application/octet-stream` with disposition `attachment`, so the browser saves it instead of rendering it on the app's origin

#### Scenario: Image preview
- **WHEN** the app shows a thumbnail of a `image/png` attachment with an `<img>` element
- **THEN** the bytes are served as `image/png` inline under the sandbox policy and the thumbnail renders

#### Scenario: SVG is not rendered as a document
- **WHEN** an `image/svg+xml` attachment is opened directly
- **THEN** it is served as `application/octet-stream` with disposition `attachment`

### Requirement: Per-file and per-account limits
The server SHALL enforce a per-file limit (default 25 MB, 1–2048) and a per-account quota (default 1024 MB, 0 for unlimited), set by the owner and optionally preset once with `OPENTODO_ATTACHMENTS_MAX_FILE_MB` and `OPENTODO_ATTACHMENTS_QUOTA_MB`. The quota counts the stored bytes of the account's non-removed attachments. A creation whose size exceeds the per-file limit SHALL be rejected at receipt so no device ever shows it.

#### Scenario: Over the per-file limit
- **WHEN** a device syncs an attachment whose size is 30 MB and the limit is 25 MB
- **THEN** the operations are rejected with reason `too_large`, the device drops the attachment and tells the user the limit

#### Scenario: Quota reached
- **WHEN** an account with 1,000 MB stored and a 1,024 MB quota uploads a 30 MB file
- **THEN** the response is 403 `quota_exceeded` naming the remaining space, nothing is stored, and the app keeps the file queued and shows the reason

#### Scenario: Removal frees quota
- **WHEN** the account removes a 100 MB attachment
- **THEN** its usage drops by 100 MB at once, even though the file stays for the retention period

#### Scenario: Invalid preset
- **WHEN** `OPENTODO_ATTACHMENTS_MAX_FILE_MB=huge` is set
- **THEN** the process exits non-zero with a message naming the variable

### Requirement: Owner settings route
`GET /api/v1/settings/attachments` SHALL report `{enabled, max_file_mb, quota_mb}` to every signed-in account; `PUT` SHALL be owner-only, validate the bounds, take effect without a restart and be audited as `settings.changed`. With `enabled` false, uploads and creations are refused with 403 `attachments_disabled` and the app hides the controls; existing files stay downloadable. Server state, not an op: online only.

#### Scenario: Owner lowers the limit
- **WHEN** the owner puts `{max_file_mb: 10}`
- **THEN** the response reports the new value, a `settings.changed` audit event names `attachments.max_file_mb`, and the next oversized upload is refused

#### Scenario: Member is refused
- **WHEN** a member sends `PUT /api/v1/settings/attachments`
- **THEN** the response is 403 `forbidden` and the settings are unchanged

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches the route
- **THEN** the response is 401 `unauthorized`

#### Scenario: Out of bounds
- **WHEN** the owner puts `{max_file_mb: 5000}`
- **THEN** the response is 400 `invalid_input` naming the field and the previous settings remain active

### Requirement: Usage display
`GET /api/v1/me` SHALL include `attachments: {enabled, used_bytes, quota_bytes, max_file_bytes}` for the signed-in account, and Settings → Data SHALL show "Attachments: X of Y used" with the per-file limit. The app SHALL keep the last fetched values for offline use and check them before queuing a file.

#### Scenario: Usage shown
- **WHEN** an account with 230 MB of attachments and a 1 GB quota opens Settings → Data
- **THEN** the panel reads "230 MB of 1 GB" and names the 25 MB per-file limit

#### Scenario: Offline check
- **WHEN** the device is offline and the user picks a file larger than the last known per-file limit
- **THEN** the file is refused with the limit named and no operation is created

### Requirement: Upload rate limit
Uploads and API creations SHALL be limited to 120 per account per hour. Beyond that the response SHALL be 429 `rate_limited`; the device keeps its queue and retries later. Downloads are not counted.

#### Scenario: Flood
- **WHEN** an account makes its 121st upload within an hour
- **THEN** the response is 429 `rate_limited`, nothing is stored, and the app shows the file as waiting

### Requirement: Offline queue and upload order
Adding a file SHALL create the metadata operations locally and keep the bytes in the device's local store. The device SHALL push its queued operations first and upload bytes only for attachments whose operations the server accepted, oldest first, retrying on reconnect until confirmed. Removing an attachment before its upload SHALL drop the local bytes and never upload them. Queued bytes SHALL be cleared at sign-out.

#### Scenario: Several files offline
- **WHEN** a user attaches three files offline and the device comes back online
- **THEN** the three metadata operations sync in one batch, then the files upload one after another in the order they were added, each turning from uploading to available on every device

#### Scenario: Removed before upload
- **WHEN** a user attaches a file offline, then removes it before syncing
- **THEN** the removal syncs with the creation, no bytes are ever uploaded, and the file is dropped from the device

#### Scenario: Creation rejected
- **WHEN** the server rejects an attachment's operations (for example `forbidden` after the user lost access to the task)
- **THEN** the device drops the attachment and its bytes and shows the rejection notice

### Requirement: Attachments in the task detail
The task detail SHALL offer Attach in its header menu and in the Add menu (file picker or link), accept paste and drag-and-drop anywhere on the panel, and SHALL show an Attachments list only when the task has attachments, each with name, type, size, state (uploading, available, waiting, missing) and, for images, a thumbnail, with actions to open, download, rename and remove. The drop zone SHALL appear while a file is dragged over the panel, not at rest.

#### Scenario: Keyboard add and open
- **WHEN** the user opens the Add menu, activates Attach file, picks a file and later activates the file
- **THEN** the attachment is created and queued, and the available file opens in a new tab or is downloaded, without a mouse

#### Scenario: Paste a screenshot
- **WHEN** the user pastes an image from the clipboard while the task detail has focus
- **THEN** an attachment named with the date and `.png` is created

#### Scenario: No attachments at rest
- **WHEN** a task without attachments is opened
- **THEN** no Attachments heading, buttons or drop hint are rendered, and dragging a file over the panel shows the drop zone

### Requirement: Attachment count, keyboard reach and offline opening
Task rows SHALL show a paperclip with the count. Everything SHALL be keyboard reachable and render from local data; opening a file needs a connection unless the bytes are on the device.

#### Scenario: Offline open
- **WHEN** the device is offline and the user activates an attachment whose bytes are not on the device
- **THEN** the row states that a connection is needed and nothing else changes

#### Scenario: Count on rows
- **WHEN** a task has two attachments
- **THEN** its row shows a paperclip with the number two

### Requirement: Removal and retention
Removing an attachment SHALL set its removal time as an operation, hide it everywhere, offer undo in the app, and free the account's quota. The file SHALL stay until the server's retention job purges the attachment (metadata and file) after the Trash retention period, or until its task is purged. Removal converges by last-writer-wins; an undo that arrives before the purge restores the file.

#### Scenario: Undo on another device
- **WHEN** a user removes an attachment on a phone and restores it from the laptop's history the next day
- **THEN** the attachment and its file are back on every device

#### Scenario: Purged after retention
- **WHEN** an attachment has been removed for longer than the Trash retention period
- **THEN** the retention job purges its metadata with a marker, deletes its file, and devices drop it on their next sync

### Requirement: Orphan files are swept
A file with no attachment row in any scope, older than seven days, SHALL be deleted by the server's retention job, so interrupted creations and files left behind by a restore of an older database do not accumulate. The sweep SHALL run in one process at a time with the other background jobs.

#### Scenario: File without metadata
- **WHEN** a file sits in the store for eight days with no attachment naming it
- **THEN** the next retention run deletes it and logs the count

#### Scenario: Recent file is kept
- **WHEN** a restore brought back a database that lacks a file's row and devices are still re-seeding
- **THEN** the file is kept for seven days, during which the re-seeded row claims it again

### Requirement: Assistants see metadata only
Server-side assistants (the MCP endpoint and the in-app assistant) SHALL see an attachment's name, type, size, link and upload state as untrusted data and SHALL have no way to read file bytes. For encrypted accounts the name, type and link SHALL appear as the encryption placeholder.

#### Scenario: Assistant reads a task
- **WHEN** an assistant asks for a task with a PDF attached
- **THEN** the result lists the PDF's name, type and size inside an untrusted-text field and offers no content or URL to it

#### Scenario: Encrypted account
- **WHEN** an assistant asks for a task of an encrypted account with an attachment
- **THEN** the attachment appears with the placeholder for its name and type and its size

### Requirement: Embedded attachments
An image attachment of a task MAY be embedded in that task's notes or in a comment of the task by reference to its id; the reference carries no bytes and does not change the attachment's quota, permissions or lifecycle. Removing an attachment that a note on this device embeds SHALL ask for confirmation naming the note; after removal, references render as "Removed image". An embed SHALL only ever name an attachment of the same task; a reference to another task's attachment or an unknown id SHALL render as "Removed image" and SHALL load nothing.

#### Scenario: Remove an embedded image
- **WHEN** the user removes an attachment that the task's notes embed
- **THEN** a confirmation names the notes, and after confirming the attachment is removed and the note shows "Removed image" in its place

#### Scenario: Reference to another task's file
- **WHEN** a comment body contains `![x](attachment:<id of a file on another task>)`
- **THEN** the app renders "Removed image" and requests nothing for that id

#### Scenario: Bytes stay where they are
- **WHEN** a 3 MB photo is embedded in a note
- **THEN** the note's document grows by the reference only, the quota is unchanged, and the bytes are still served solely by the attachment content route
