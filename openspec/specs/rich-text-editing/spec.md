# rich-text-editing Specification

## Purpose
Defines rich text for long-form fields, starting with task notes: the formatting available, how the document is stored as a mergeable value in the operation log so concurrent edits from several devices converge without losing text, and how a plain-text projection keeps the API, export and older clients working.

## Requirements

### Requirement: Rich-text notes editor
The task detail panel SHALL edit notes as rich text supporting paragraphs, headings, bold, italic, strikethrough, inline code, links, and bullet, numbered and check lists. Every formatting action SHALL be reachable from the keyboard, and Markdown-style input rules SHALL apply formatting while typing. Edits SHALL apply locally and offline immediately and SHALL be recorded as operations, converging with other devices under the document merge rules of this capability.

#### Scenario: Format with the keyboard
- **WHEN** the user selects text in the notes and presses the bold shortcut, or types `- ` at the start of a line
- **THEN** the selection becomes bold, or the line becomes a bullet item, with no mouse interaction

#### Scenario: Edit offline
- **WHEN** the device is offline and the user edits a note
- **THEN** the change is visible immediately, survives a reload, and is uploaded on the next successful sync

#### Scenario: Checklist item toggled
- **WHEN** the user toggles a check-list item in the notes
- **THEN** its checked state is saved as part of the note and shows the same on every device after sync

### Requirement: Notes stored as a mergeable document
A task SHALL have an additional field `notes_doc` holding the note as an opaque, encoded text document whose encoding merges concurrent edits deterministically. It SHALL travel as an ordinary operation value: validated as an encoded string, stored per field with the existing winner rule, synced, exported and accepted by the REST API. A task created without notes SHALL have an empty `notes_doc`, and offline devices SHALL keep editing their local document until they can sync.

#### Scenario: Default on creation
- **WHEN** a task is created with only a title
- **THEN** its `notes_doc` is empty and its `description` is the empty string

#### Scenario: Invalid document value
- **WHEN** a sync batch or REST write carries a `notes_doc` that is not a correctly encoded document
- **THEN** the write is rejected with a 400 error (`invalid_op` for sync, `invalid_input` for REST) and no field changes

#### Scenario: New device catches up
- **WHEN** a device with an empty cursor syncs
- **THEN** it receives the current `notes_doc` of every task and renders the same rich text as the other devices

### Requirement: Concurrent note edits converge without loss
When devices edit the same note concurrently, the note after sync SHALL contain every device's insertions and deletions, merged character by character, identically on every device and in the server's stored value. A device receiving a document that differs from its own SHALL merge the two and SHALL publish the merged document only when the merge added something the received document lacked, so merging identical documents produces no further operation.

#### Scenario: Two paragraphs added offline
- **WHEN** device A appends a paragraph to a note while offline and device B appends a different paragraph to the same note while offline, then both sync
- **THEN** every device and the REST representation show the note with both paragraphs

#### Scenario: Edit and delete overlap
- **WHEN** device A deletes a sentence while device B bolds a word inside a different sentence of the same note, and both sync
- **THEN** the sentence is gone and the word is bold on every device

#### Scenario: Merge terminates
- **WHEN** two devices both receive each other's merged documents
- **THEN** neither publishes a further operation for that note and the field's winner is stable on every device

### Requirement: Plain-text projection kept in sync
The `description` field SHALL remain the plain-text projection of the note, rendered as Markdown, and SHALL be written in the same mutation as `notes_doc` whenever the document changes, so API clients, the export, list previews and older clients keep seeing readable text. The projection SHALL be derived deterministically from the merged document, so after convergence every device holds the same `description`.

#### Scenario: API reads formatted notes
- **WHEN** a note contains a heading, a bold word and a check list, and a script fetches the task through the REST API
- **THEN** `description` contains the equivalent Markdown text and `notes_doc` the encoded document

#### Scenario: Export after concurrent edits
- **WHEN** two devices edited the same note concurrently and both have synced
- **THEN** the export's `description` for that task contains the text of both edits

### Requirement: Plain-text writes fold back into the document
When `description` is changed by a writer that does not update `notes_doc` (REST API, older client) and that change is newer than the document's last change, the client SHALL replace the document content with the text parsed as Markdown and publish the resulting document and projection pair. An older plain-text write SHALL NOT override a newer document. The rule runs offline on whichever device next opens the note, and all devices converge through the merge rules.

#### Scenario: Script edits the note
- **WHEN** a script PATCHes `description` with `"- [ ] call the plumber"` and a device syncs afterwards
- **THEN** the device shows a check-list item with that text and the next sync carries a matching `notes_doc`

#### Scenario: Stale plain-text write loses
- **WHEN** a plain-text write to `description` older than the latest document edit arrives after it
- **THEN** the document is unchanged and `description` is re-projected from the document

### Requirement: Document size limits
A `notes_doc` value SHALL be accepted up to 256 KB encoded; larger values SHALL be rejected as invalid. The editor SHALL warn the user before the limit is reached and SHALL refuse further input at the limit rather than producing an operation the server will reject. Offline edits SHALL be subject to the same limit so a pending outbox can never be refused for size.

#### Scenario: Oversized document rejected
- **WHEN** a sync batch carries a `notes_doc` larger than 256 KB
- **THEN** the response is 400 with code `invalid_op` and nothing from the batch is stored

#### Scenario: Editor approaches the limit
- **WHEN** a note grows past 90% of the limit
- **THEN** the editor shows a size warning, and at the limit further insertions are refused

### Requirement: Remote edits while editing
When a merged document arrives while the user is editing the same note, the editor SHALL apply the remote change in place without discarding unsaved typing, without resetting the caret to the start or end, and without flashing the content. With a live update channel connected, a remote change SHALL appear within two seconds; without one, on the next sync exchange.

#### Scenario: Co-editing one note
- **WHEN** device A is typing in a note and device B inserts text above the caret
- **THEN** device A shows B's text, A's caret stays on the character it was on, and A's in-progress typing is intact

### Requirement: Compatibility with plain-text clients
A client that knows only `description` SHALL keep working: it SHALL continue to read readable text, its writes SHALL be folded into the document by any rich-text client that later touches the note, and it SHALL never cause the document to be rejected or reset. Rich-text clients SHALL ignore unknown formatting features from newer documents rather than failing to open the note.

#### Scenario: Older client edits a task
- **WHEN** a device running a build without rich text changes a task's `description` and syncs
- **THEN** the text appears in the note on rich-text devices and the task's other fields are unaffected

#### Scenario: Unknown formatting
- **WHEN** a newer client stores a formatting mark this client does not know
- **THEN** the note still opens and the unknown mark is preserved through the merge, not stripped
