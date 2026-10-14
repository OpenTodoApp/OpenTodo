# Spec Delta

## Purpose

Gives every project a note: a rich-text brief shown at the top of the project's list and board, edited collaboratively like task notes, readable as Markdown by the API, the export and integrations.

## ADDED Requirements

### Requirement: Project note fields
A project SHALL have two additive fields: `description`, a Markdown string, and `notes_doc`, an opaque encoded document that merges concurrent edits. Both SHALL default to empty, SHALL be written through the operation log, SHALL be editable offline with the change visible at once, and SHALL converge on every device under the document merge, projection and fold-back rules that `rich-text-editing` defines for task notes.

#### Scenario: Default on creation
- **WHEN** a project is created with a name
- **THEN** its `description` is the empty string, its `notes_doc` is empty, and no operation is written for either

#### Scenario: Two devices edit the note offline
- **WHEN** device A adds a paragraph to a project's note while offline and device B adds a different paragraph while offline, then both sync
- **THEN** every device shows both paragraphs and the project's `description` holds both in the same order on every device

#### Scenario: Plain-text write folds in
- **WHEN** a script PATCHes a project's `description` to `"Meet at **gate B**"` and a device later opens the project
- **THEN** the note shows "gate B" in bold and the device publishes a matching `notes_doc` with the projection unchanged

#### Scenario: Older server rejects the field
- **WHEN** a device that knows project notes syncs a note to a server built before this change
- **THEN** the server refuses the operations as invalid, the device keeps its local note, and no other field of the project is affected

### Requirement: Note shown at the top of the project
The project view SHALL show the note, rendered from the document, directly under the project header and above the tasks, in both the list and the board layout. A note longer than a few lines SHALL be folded with a control to show it in full; the folded state SHALL be a per-device preference that is not synced. A project without a note SHALL show nothing to a viewer and a quiet "Add a note" affordance to a user who may edit it.

#### Scenario: Board shows the note too
- **WHEN** a project with a note is switched to the board layout
- **THEN** the note stays visible above the columns, unchanged

#### Scenario: Long note folds per device
- **WHEN** a note has twenty lines and the user folds it on a laptop
- **THEN** the laptop shows the first lines with a "Show more" control, and the user's phone still shows the note as it was

#### Scenario: Empty note for a viewer
- **WHEN** a viewer of a shared project opens a project without a note
- **THEN** no note area and no "Add a note" control are shown

### Requirement: Editing the note in place
A user who may edit the note SHALL open it for editing in place by activating the note or pressing <kbd>Shift</kbd>+<kbd>P</kbd> in the project view, in the same rich-text editor as task notes, with the same formatting, keyboard shortcuts, size limit and remote-edit behaviour. <kbd>Esc</kbd> SHALL leave the editor with the note saved. A viewer SHALL see the note as read-only text.

#### Scenario: Keyboard edit
- **WHEN** an editor presses <kbd>Shift</kbd>+<kbd>P</kbd> in a project while no text field has focus
- **THEN** the note editor opens with the caret at the end of the note, and <kbd>Esc</kbd> closes it with the text kept

#### Scenario: Remote edit while editing
- **WHEN** another member changes the note while the user is typing in it
- **THEN** the change appears in place without discarding the user's typing or moving the caret

#### Scenario: Size limit
- **WHEN** a project note reaches the document size limit of `rich-text-editing`
- **THEN** the editor refuses further input and shows the same warning as a task note, and no operation the server would reject is written

### Requirement: Project note in the API, export and import
The REST API SHALL return and accept `description` and `notes_doc` on projects under the validation rules of `rich-text-editing`; the JSON export SHALL carry both; importing an own export SHALL restore both with the project. Changes made through the API SHALL reach devices as ordinary operations and converge like any note edit.

#### Scenario: API reads a project note
- **WHEN** a script fetches a project whose note has a heading and a check list
- **THEN** `description` holds the equivalent Markdown and `notes_doc` the encoded document

#### Scenario: Invalid document rejected
- **WHEN** a REST write carries a project `notes_doc` that is not a correctly encoded document
- **THEN** the response is 400 `invalid_input` and the project is unchanged

#### Scenario: Unauthenticated write
- **WHEN** a request without credentials PATCHes a project's `description`
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Export round trip
- **WHEN** an export holding a project with a note is imported into an empty account
- **THEN** the project's `description` and `notes_doc` equal the file's values

### Requirement: History, activity and integrations read the projection
Revision history, activity, webhook deliveries and the demo sandbox SHALL treat `project.notes_doc` as opaque, exactly as `task.notes_doc`: history and activity SHALL show a note change as an edit of the notes with `description` as the readable value, a webhook delivery SHALL carry `description` and never `notes_doc`, and the demo sandbox SHALL apply its notes size cap to both fields. MCP and the in-app assistant SHALL read the description only.

#### Scenario: Project history after a note edit
- **WHEN** an admin edits a project's note and opens the project's history
- **THEN** the change set is labelled as a notes edit, shows the Markdown before and after, and restoring it writes `description` and lets the device fold it into the document

#### Scenario: Webhook delivery
- **WHEN** a project note changes and a webhook subscribes to project updates
- **THEN** the delivery lists `description` among the changed fields and does not contain `notes_doc`

### Requirement: Project note for encrypted accounts
For an end-to-end encrypted account, `project.description` and `project.notes_doc` SHALL be content fields: encrypted on the device before upload, decrypted on the user's devices, converging on ciphertext like other content, and shown as a placeholder wherever the server renders project text.

#### Scenario: Encrypted note on the server
- **WHEN** an encrypted account writes a project note and a script reads the project with a bearer token
- **THEN** both `description` and `notes_doc` are ciphertext strings and the project's `color` is plaintext

#### Scenario: Assistant sees a placeholder
- **WHEN** an assistant calls `list_projects` for an encrypted account
- **THEN** the project's description is the ciphertext placeholder and `encrypted` is true
