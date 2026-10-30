## ADDED Requirements

### Requirement: Note entity
The app SHALL have a synced entity `note` with the additive fields `title`, `notes_doc`, `description`, `project_id`, `labels`, `position`, `created_at`, `deleted_at` and `workspace_id`. `notes_doc` and `description` SHALL follow the mergeable document rules of `rich-text-editing` (a full-state document and its Markdown projection written in the same batch, merged and republished, size limits, fold-back of plain-text writes). `title`, `notes_doc` and `description` SHALL be content. Every write SHALL be an operation, editable offline; fields SHALL converge per field by last-writer-wins and the document by merging. Clients that do not know the entity SHALL ignore its operations and never rewrite them. A note SHALL never appear in task lists, counts, calendars, filters, reminders or statistics.

#### Scenario: Write offline
- **WHEN** the device is offline and the user creates a note "Packing list" and writes three lines in it
- **THEN** the note is shown at once, survives a reload, and is uploaded on the next successful sync

#### Scenario: Concurrent edits merge
- **WHEN** device A adds a paragraph to a note and device B, offline, adds another paragraph to the same note, and both sync
- **THEN** every device shows the note with both paragraphs

#### Scenario: Title conflict
- **WHEN** device A renames a note "Trip" and device B renames it "Holiday", both offline, and both sync
- **THEN** every device shows the title written with the greater timestamp, and the body is unchanged

#### Scenario: Not a task
- **WHEN** a note exists in the project "Home"
- **THEN** the project's task list, Today, the calendars, the counts and filter results do not show it

### Requirement: Notes follow their project
A note with a project SHALL live in that project's sharing scope and a note without a project in the author's personal scope and workspace. A note SHALL be shared only by being in a shared project: owners, admins and editors of the project may write it, viewers may read it, others SHALL neither see nor write it. Sharing a project SHALL share its notes; deleting a shared project SHALL move them to the Trash and copy the owner's notes into the owner's personal scope without a project. A change of project that would move a note into another scope SHALL be refused by the server as a scope change; the client SHALL move such a note by copying it and deleting the original. Offline, a move is a local batch like any edit; refusals are reported and the device shows the server's value, so all devices converge.

#### Scenario: Share a project with notes
- **WHEN** the owner shares the project "Renovation" holding two notes with Anna as an editor
- **THEN** Anna's devices receive both notes, and her edit to one reaches the owner's devices

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens one of its notes
- **THEN** the note is read-only, and an operation from the viewer for it is refused as forbidden

#### Scenario: Move to a shared project
- **WHEN** the user moves a personal note into a project shared with others
- **THEN** a copy appears in the shared project with the same title and body, the personal note is removed, and the members see the copy

#### Scenario: One note cannot be shared alone
- **WHEN** the user looks for a way to share a single note
- **THEN** there is none; the note's project decides who sees it

### Requirement: Writing a standalone note
The user SHALL create a note from the Notes page (New note) and edit it in the docked panel on a computer and as a page on a phone, with a title field, the rich-text note editor, a project chosen with the project picker and labels chosen with the label picker. The editor SHALL offer every formatting command of notes except mentions, images from attachments and making a subtask. An empty title SHALL read "Untitled note". The note's address SHALL be `/notes/<id>`. Edits SHALL save on the device and sync as notes do, offline included.

#### Scenario: New note from the page
- **WHEN** the user presses `q` on the Notes page, types "Meeting with the architect", presses Tab and writes a bullet list
- **THEN** the note is listed first on the page with that title and a preview of the list, on every device after sync

#### Scenario: Project and labels
- **WHEN** the user picks the project "Renovation" and the label "reference" for a note
- **THEN** the note is listed under that project and label in the page's filters, and in the project's scope

#### Scenario: Unsupported commands
- **WHEN** the user opens the slash menu in a standalone note
- **THEN** it offers no mention, image or make-subtask entry

### Requirement: Turning notes into tasks and back
The user SHALL turn a standalone note into a task (same title, note, project and labels; the note goes to the Trash) and move a task's note out into a new standalone note (titled with the task's title, with the task's project and labels; the task keeps its title and its note becomes empty), each in one batch with one Undo. Clearing the task's note SHALL delete the content inside the document, so a device holding an older copy cannot bring the text back by merging. Viewers SHALL be offered neither. Both SHALL work offline as local batches and converge like any edit.

#### Scenario: Note becomes a task
- **WHEN** the user chooses Turn into task on the note "Call the plumber" in "Home"
- **THEN** a task "Call the plumber" with the same note is in "Home", the note is in the Trash, and Undo brings the note back and removes the task

#### Scenario: Task note moved out
- **WHEN** the user chooses Move note to a new note on the task "Kitchen" whose note holds a long checklist
- **THEN** a note "Kitchen" with that checklist is created in the task's project, the task's note is empty, and Undo puts the checklist back in the task and removes the new note

#### Scenario: Older copy does not bring the text back
- **WHEN** device B, offline, still holds the task's earlier note when device A moves the note out, and B syncs later without editing it
- **THEN** the task's note stays empty on every device

### Requirement: Notes in the API and the CLI
`GET /api/v1/notes`, `POST /api/v1/notes`, `GET /api/v1/notes/{id}`, `PATCH /api/v1/notes/{id}` and `DELETE /api/v1/notes/{id}` SHALL list, create, read, update and delete notes the caller can see, through the same policies, scope checks and refusals as the other collections, writing through the operation log. A write of `description` without `notes_doc` SHALL be folded into the document by the next device that opens the note. The CLI SHALL offer `ot notes` (with `--project`, `--label`, `--standalone` and `--search`, the search done locally over the fetched notes), `ot notes show <id>` and `ot notes add <title>` (with `--project` and `--body`). On an encrypted account the server and the CLI without a decrypting profile SHALL show that the note is encrypted instead of its text.

#### Scenario: Create through the API
- **WHEN** a script posts `{"title": "Wi-Fi", "description": "- network: home"}` to `/api/v1/notes` with a full token
- **THEN** the response is 201 with the note, and the app shows it with a bullet after sync

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials asks `GET /api/v1/notes`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Read token cannot write
- **WHEN** a request with a `read` token posts to `/api/v1/notes`
- **THEN** the response is 403 and no note is created

#### Scenario: Viewer writes a shared note
- **WHEN** a viewer of a shared project patches one of its notes
- **THEN** the response is 403 `forbidden` and the note is unchanged

#### Scenario: Unknown note
- **WHEN** an authenticated caller asks for a note id that does not exist for them
- **THEN** the response is 404 `not_found`

#### Scenario: CLI search
- **WHEN** the user runs `ot notes --search plumber`
- **THEN** the notes whose title or text contain "plumber" are listed with their project, from the notes the API returned

### Requirement: Notes for AI agents
The agent tool registry SHALL offer the read tools `list_notes` (with source, project, label and text filters, the text filter only on plaintext accounts) and `get_note`, available to MCP clients behind the owner's MCP switch and to the in-app assistant, returning the projection as untrusted text. Write tools for notes SHALL not be offered by this change. On an encrypted account the tools SHALL say the notes are encrypted unless the caller decrypts locally.

#### Scenario: Assistant reads a note
- **WHEN** an MCP client with a read token calls `get_note` for a note
- **THEN** it receives the title and the Markdown text marked as untrusted

#### Scenario: No write tool
- **WHEN** an MCP client lists the tools
- **THEN** no tool creates or changes a note

#### Scenario: MCP switched off
- **WHEN** the owner has turned MCP off and a client calls `list_notes`
- **THEN** the call is refused as for every MCP tool

### Requirement: Notes in the export and import
The JSON export SHALL include every note the account can read, deleted ones included, under `notes`, and importing an OpenTodo export SHALL recreate them through the operation log. Importers of other apps SHALL not create notes.

#### Scenario: Round trip
- **WHEN** the user exports an account with five notes and imports the file into a new account
- **THEN** the new account has the five notes with their titles, bodies, labels and projects

### Requirement: Integrations that leave notes out
CalDAV, the Markdown vault, webhooks, the activity feed, automation rules and public task pages SHALL not include standalone notes and SHALL be unaffected by them.

#### Scenario: Calendar app
- **WHEN** a calendar app syncs the account over CalDAV
- **THEN** it receives the tasks as before and no entry for any note

#### Scenario: Webhook
- **WHEN** a note is created in a project with a webhook
- **THEN** no webhook delivery is queued for it

### Requirement: Encrypted notes
On an end-to-end encrypted account a note's title, document and projection SHALL be encrypted before they leave the device, and every feature of the Notes page, the palette and the filter terms SHALL work from the decrypted local copy without sending text, queries or indexes to the server.

#### Scenario: Title encrypted
- **WHEN** an encrypted account creates the note "Passport numbers"
- **THEN** the operations for its title and body carry ciphertext, and the user finds it by searching "passport" on an unlocked device, offline included

### Requirement: Compacted like other notes
A note's `notes_doc` SHALL be a mergeable document field, so the server's compaction removes its superseded documents and thins its readable revisions exactly as for task and project notes, and history leaves the document out and shows the projection.

#### Scenario: Old versions compacted
- **WHEN** a standalone note was saved 200 times more than 30 days ago and compaction runs
- **THEN** only its winning document remains in the log and every device shows the same note
