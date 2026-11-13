## MODIFIED Requirements

### Requirement: Attachment entity
An attachment SHALL belong to exactly one parent, a task or a standalone note, and, when its parent is a task, optionally to one comment of that task. It SHALL have a name, a media type, a size in bytes, a digest of the stored bytes, an author, a creation time, an optional removal time and an optional link. Its parent and comment SHALL be immutable after creation. Metadata SHALL be stored and synced as operations in the scope of its parent, created offline and converging by per-field last-writer-wins; file bytes SHALL never travel through the operation log.

#### Scenario: Attach offline
- **WHEN** a user adds a photo to a task while offline and reconnects later
- **THEN** the attachment is listed on the task at once on that device, and on every device that can see the task after their next sync, with the same id, name, size and author

#### Scenario: Attach to a note offline
- **WHEN** a user adds a PDF to the standalone note "Trip to Lisbon" while offline and reconnects later
- **THEN** the attachment is listed under the note at once on that device, and on every device that can see the note after their next sync, with the same id, name, size and author

#### Scenario: Concurrent rename
- **WHEN** two devices rename the same attachment offline and both sync
- **THEN** every device shows the name written with the greater timestamp, and no attachment is duplicated

#### Scenario: Invalid metadata
- **WHEN** a device submits an attachment whose size is not a number, whose name is empty, or whose task or note is not in a scope the author can read
- **THEN** the batch is refused as invalid or the operation is rejected, and nothing is stored

#### Scenario: Two parents
- **WHEN** a device submits an attachment naming both a task and a note, neither, or a note and a comment
- **THEN** the operation is rejected as invalid and nothing is stored

### Requirement: Embedded attachments
An image attachment of a task MAY be embedded in that task's notes or in a comment of the task, and an image attachment of a standalone note MAY be embedded in that note, by reference to its id; the reference carries no bytes and does not change the attachment's quota, permissions or lifecycle. Removing an attachment that a note on this device embeds SHALL ask for confirmation naming the note; after removal, references render as "Removed image". An embed SHALL only ever name an attachment of the same task or the same standalone note; a reference to another parent's attachment or an unknown id SHALL render as "Removed image" and SHALL load nothing.

#### Scenario: Remove an embedded image
- **WHEN** the user removes an attachment that the task's notes embed
- **THEN** a confirmation names the notes, and after confirming the attachment is removed and the note shows "Removed image" in its place

#### Scenario: Reference to another task's file
- **WHEN** a comment body contains `![x](attachment:<id of a file on another task>)`
- **THEN** the app renders "Removed image" and requests nothing for that id

#### Scenario: Image from another note
- **WHEN** the text of the standalone note "Recipes" contains `![x](attachment:<id of a file on the note "Trip">)`
- **THEN** the app renders "Removed image" and requests nothing for that id

#### Scenario: Bytes stay where they are
- **WHEN** a 3 MB photo is embedded in a note
- **THEN** the note's document grows by the reference only, the quota is unchanged, and the bytes are still served solely by the attachment content route

## ADDED Requirements

### Requirement: Attachments on standalone notes
Anyone who may read a standalone note SHALL be able to attach to it, viewers of its project included; only the author SHALL rename; the author, the project's admins and owner, and for a personal note its author SHALL be able to remove. The server SHALL check these rules per operation at receipt. The per-file limit, the account quota, the upload rate limit, the offline queue and upload order, download, safe serving, removal and retention and the orphan sweep SHALL apply to note attachments exactly as to task attachments. Deleting a note SHALL hide its attachments; restoring it from the Trash SHALL show them again; purging it SHALL purge them. Below a standalone note's text the app SHALL show an Attachments list only while the note has attachments, with the rows and actions of the task detail's list, and SHALL offer Attach in the note's menu and accept paste and drop on the note. Everything SHALL be keyboard reachable and render from local data offline.

#### Scenario: Viewer attaches to a shared note
- **WHEN** a viewer of the shared project "Renovation" attaches a photo to one of its notes
- **THEN** the attachment is accepted and every member sees it under the note after sync

#### Scenario: Rename by someone else
- **WHEN** an editor submits a new name for an attachment another member added to a note
- **THEN** the operation is rejected with reason `forbidden` and the name is unchanged everywhere

#### Scenario: No attachments at rest
- **WHEN** a standalone note without attachments is opened
- **THEN** no Attachments heading, button or drop hint is shown, and dragging a file over the note shows the drop zone

#### Scenario: Note in the Trash
- **WHEN** a note with two attachments is moved to the Trash and later restored
- **THEN** the attachments are hidden while it is in the Trash, the quota still counts them, and they are listed again after the restore on every device

### Requirement: Attachments move with their note
A note moved into a project of another sharing scope SHALL be copied with its live attachments: the copy batch SHALL create new attachment rows on the copy that name the same stored file (same digest, size and type), upload nothing, and remove the original's rows with the original. Turning a note into a task SHALL move its live attachments to the new task, and moving a task's note into a new note SHALL move the attachments that note embeds to the new note, each in the conversion's one batch with its embeds rewritten to the new ids, undone by its one Undo. A stored file SHALL be deleted only when no attachment row names it any longer. Offline, these are local batches; refusals revert on the device and every device converges on the server's result.

#### Scenario: Move to a shared project
- **WHEN** the user moves a personal note with an embedded 3 MB photo into a project shared with Anna
- **THEN** Anna sees the copy with the photo, no bytes are uploaded again, and the personal note and its rows are gone

#### Scenario: Turn into task
- **WHEN** the user turns the note "Boiler manual" with one PDF and one embedded image into a task
- **THEN** the task lists both attachments, its note shows the image, and Undo brings the note back with both

#### Scenario: Original purged
- **WHEN** the original rows of a copied note are purged after the Trash retention period
- **THEN** the copy's attachments still download

### Requirement: Note attachments in the API
`GET /api/v1/notes/{id}/attachments` SHALL list a note's non-removed attachments in creation order with their upload state, and `POST /api/v1/notes/{id}/attachments` SHALL create one in one request (a multipart `file` part, or a JSON link `{name?, url}`), writing the metadata as the caller with device `server`, with the limits, permissions and `Idempotency-Key` of the task route. Both SHALL be registered as signed-in routes; `read` and `agent` tokens SHALL be refused on the write; the rename, remove, upload and content routes SHALL serve note attachments unchanged. On a demo instance the create route SHALL be refused as the task route is.

#### Scenario: Script attaches a file to a note
- **WHEN** a script posts a 2 MB PDF to a note it can read with a `full` token
- **THEN** the response is 201 with the attachment's id, name, type, size, digest and `uploaded_at`, and devices receive it on their next sync

#### Scenario: Anonymous request
- **WHEN** a request without credentials calls either route
- **THEN** the response is 401 `unauthorized`

#### Scenario: Read token
- **WHEN** a `read` or `agent` token posts to the create route
- **THEN** the response is 403 `insufficient_scope` and nothing is stored

#### Scenario: Unreadable note
- **WHEN** an authenticated user posts to a note of a project they are not a member of, or to an id that does not exist
- **THEN** the response is 404 `not_found` and nothing is stored
