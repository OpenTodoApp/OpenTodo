# standalone-notes Specification

## Purpose
Standalone notes: a synced `note` entity that is not a task, its sharing through its project, editing, conversions to and from tasks, end-to-end encryption, and its coverage in the REST API, the CLI, MCP, the export and import, with the integrations that leave it out.

## Requirements

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

### Requirement: Notes in the API
`GET /api/v1/notes`, `POST /api/v1/notes`, `GET /api/v1/notes/{id}`, `PATCH /api/v1/notes/{id}` and `DELETE /api/v1/notes/{id}` SHALL list, create, read, update and delete notes the caller can see, through the same policies, scope checks and refusals as the other collections, writing through the operation log with `ApplyStrict` and waking devices. A read SHALL return the note's `body_version` and its pending appends. A write of `description` without `notes_doc` SHALL be folded into the document by the next device that opens the note (the fold-back rule of `rich-text-editing`). `POST /api/v1/notes/{id}/append`, `POST /api/v1/tasks/{id}/note/append` and `POST /api/v1/notes/{id}/to-task` SHALL require a signed-in caller with a token or session that may write, SHALL refuse `read` and `agent` tokens, and SHALL write one batch: an append writes one pending append (see "Appended text merges into the document"); to-task creates a task with the note's title, document, projection, project and labels and moves the note to the Trash. Offline devices receive these writes on their next sync and converge on them like any other operation. On an encrypted account the server SHALL show that the note is encrypted instead of its text, and to-task SHALL require the new task's values sealed by the caller.

#### Scenario: Create through the API
- **WHEN** a script posts `{"title": "Wi-Fi", "description": "- network: home"}` to `/api/v1/notes` with a full token
- **THEN** the response is 201 with the note, and the app shows it with a bullet after sync

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials asks `GET /api/v1/notes` or posts to `/api/v1/notes/{id}/append`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Read token cannot write
- **WHEN** a request with a `read` token posts to `/api/v1/notes` or to `/api/v1/notes/{id}/to-task`
- **THEN** the response is 403 and nothing is written

#### Scenario: Viewer writes a shared note
- **WHEN** a viewer of a shared project patches one of its notes or appends to it
- **THEN** the response is 403 `forbidden` and the note is unchanged

#### Scenario: Unknown note
- **WHEN** an authenticated caller asks for, appends to or converts a note id that does not exist for them
- **THEN** the response is 404 `not_found`

#### Scenario: Turn into a task through the API
- **WHEN** a script with a full token posts to `/api/v1/notes/{id}/to-task` for the note "Call the plumber" in "Home"
- **THEN** the response is 201 with a task "Call the plumber" in "Home" carrying the same note, and the note is in the Trash on every device after sync

### Requirement: Notes in the CLI
The CLI SHALL offer `ot notes list` (also bare `ot notes`, with `--source`, `--standalone`, `--project`, `--label`, `--search` and `--limit`), `ot notes search <text>`, `ot notes show <ref>`, `ot notes add <title>` (with `--project`, `--label`, `--body` or `--body-file`, `--idempotency-key`), `ot notes edit <ref>` (with `--title`, `--project`, `--label`, `--body` or `--body-file`), `ot notes append <ref> <text>` (or `--body-file`), `ot notes rm <ref>...` and `ot notes to-task <ref>`, with table output and `--json` output described in `ot schema`, `--dry-run` on every write and `--read-only` refusing every write. References SHALL be ids or unambiguous title prefixes. Search SHALL be done on the user's machine over the notes the API returned, with the matching and ranking of "Searching notes on the device". Text SHALL be read and written as Markdown through the REST routes: `show` prints the projection followed by pending appends; `edit --body` replaces the text with the version check of "Plain-text replacement checks the version"; `append` never replaces text. `rm` SHALL move notes to the Trash with the `--yes` rules of `ot rm`. The CLI is online-only: a write either reaches the server and then every device on its next sync, or fails with nothing written.

#### Scenario: CLI search
- **WHEN** the user runs `ot notes search plumber`
- **THEN** the notes whose title or text contain "plumber" are listed with their project, title matches first, from the notes the API returned

#### Scenario: Show as Markdown
- **WHEN** the user runs `ot notes show 3fa1` for a note with a checklist and one pending append
- **THEN** the checklist is printed as `- [ ]` lines followed by the appended text

#### Scenario: Append from a script
- **WHEN** a script runs `ot notes append "Meeting" "- decided: ship Friday" --json`
- **THEN** the envelope carries the note id and the append id, and after sync every device shows the line at the end of the note, with any edit made on a phone meanwhile kept

#### Scenario: Edit refused after a newer change
- **WHEN** the user runs `ot notes edit 3fa1 --body-file notes.md` and the note was edited in the app after the CLI read it
- **THEN** the command fails with `body_changed`, exit 1, and the note is unchanged

#### Scenario: Remove needs --yes off a terminal
- **WHEN** an agent runs `ot notes rm 3fa1 --json` without a terminal and without `--yes`
- **THEN** nothing is deleted and the exit code is 2

#### Scenario: Turn into a task
- **WHEN** the user runs `ot notes to-task "Call the plumber"`
- **THEN** the task id is printed, the task has the note's text, and the note is in the Trash

### Requirement: Notes for AI agents: reads
The agent tool registry SHALL offer the read tools `list_notes` (with source, project and label filters, a limit and a cursor, newest first), `search_notes` (a query with the same filters, matched and ranked like "Searching notes on the device") and `get_note` (title, Markdown text, pending appends, project, labels, `body_version`, updated time), and MCP SHALL offer the resources `opentodo://notes` (the newest standalone notes) and `opentodo://notes/{id}` (as `get_note`). They SHALL be available behind the owner's MCP switch to every token MCP accepts and to the in-app assistant, SHALL exclude deleted notes, write nothing, reflect only what devices have synced, and return every title, text, snippet and append inside `untrusted_text`.

#### Scenario: Assistant reads a note
- **WHEN** an MCP client with a read token calls `get_note` for a note
- **THEN** it receives the title and the Markdown text inside `untrusted_text`, and the `body_version`

#### Scenario: Search
- **WHEN** an MCP client calls `search_notes` with `query: "plumber"` on a plaintext account
- **THEN** the matching task, project and standalone notes are returned with snippets marked as untrusted, title matches first

#### Scenario: Resource
- **WHEN** an MCP client reads `opentodo://notes`
- **THEN** it receives the newest standalone notes as `list_notes` returns them

#### Scenario: MCP switched off
- **WHEN** the owner has turned MCP off and a client calls `list_notes`
- **THEN** the call is refused as for every MCP tool

### Requirement: Notes for AI agents: writes
The registry SHALL offer the write tools `create_note`, `update_note`, `append_to_note` (to a note or to a task's note), `trash_note` and `note_to_task`, listed and run only when the write permission gate of `mcp-server` passes (MCP on, the owner's assistant writes on, the user's switch on, an `agent` token), and otherwise omitted from `tools/list` and refused with the gate's error. Each call SHALL plan its changes, write them through the operation log with the device `agent:<token-id>`, count against the write limits, be audited as `agent.write` without its text, appear in history as made by an AI assistant and be undoable. `update_note` SHALL require `base_version` when it changes the text and refuse a stale one with `body_changed`; `append_to_note` SHALL never replace text; `trash_note` SHALL accept only notes created with the same token and refuse others with `not_permitted`, changing nothing; `note_to_task` SHALL convert in one batch. The in-app assistant SHALL propose the same changes and the browser SHALL apply only the confirmed part. Devices that are offline receive the writes on their next sync and converge on them.

#### Scenario: Agent creates a note
- **WHEN** an allowed `agent` token calls `create_note` with title "Retro" and a Markdown description
- **THEN** the note is created, history shows it as made by an AI assistant, and an `agent.write` audit event names `create_note` without the text

#### Scenario: Gate closed
- **WHEN** the user's switch is off and an `agent` token calls `append_to_note`
- **THEN** the result is the tool error `writes_disabled_by_user` and the note is unchanged

#### Scenario: Read token sees no write tool
- **WHEN** an MCP client with a `read` token lists the tools
- **THEN** no tool that creates or changes a note is listed

#### Scenario: Stale update
- **WHEN** an agent calls `update_note` with a description and a `base_version` older than an edit made on a phone since
- **THEN** the result is the tool error `body_changed` and the phone's edit stays

#### Scenario: Append keeps concurrent edits
- **WHEN** an agent calls `append_to_note` while device B, offline, adds a paragraph to the same note, and B syncs later
- **THEN** every device shows B's paragraph and the appended text once

#### Scenario: Trash only own notes
- **WHEN** an agent calls `trash_note` for a note the user wrote in the app
- **THEN** the result is the tool error `not_permitted` and the note stays

#### Scenario: Write limits
- **WHEN** an agent token has made 30 write calls in the last minute and calls `create_note`
- **THEN** the call is refused as rate limited and nothing is written

### Requirement: Notes in the CLI and MCP on encrypted accounts
On an end-to-end encrypted account, text SHALL be read and written only where the account key is: `ot notes` and `ot task note` with a profile unlocked by `ot encryption unlock` SHALL decrypt and encrypt on the user's machine, and without the key SHALL show that notes are encrypted and refuse text writes with `encryption_enabled` (exit 5). MCP SHALL behave as for tasks: without an opted-in device, reads return the encrypted placeholder, `create_note`, `update_note` and `append_to_note` accept text only as ciphertext envelopes and refuse plaintext with `encryption_enabled`, `trash_note` and project and label changes work, and `search_notes` and `note_to_task` return `encryption_enabled`; `ot mcp --decrypt` SHALL encrypt the note tools' text arguments and decrypt their results on the user's machine, answer `search_notes` by matching decrypted notes locally, and refuse `note_to_task` pointing to `ot notes to-task`; with an opted-in device, text SHALL be decrypted and encrypted through it, `note_to_task` included, and `search_notes` SHALL return `encryption_enabled`. The server SHALL only ever receive ciphertext for note text.

#### Scenario: Locked CLI
- **WHEN** the user of an encrypted account runs `ot notes append "Meeting" "call back"` without having run `ot encryption unlock`
- **THEN** the command fails with `encryption_enabled`, exit 5, and nothing is written

#### Scenario: Unlocked CLI
- **WHEN** the same user unlocks the profile and runs the command again
- **THEN** the server stores the append as ciphertext and the unlocked app shows "call back" at the end of the note

#### Scenario: Plaintext refused over MCP
- **WHEN** an allowed agent of an encrypted account with no opted-in device calls `create_note` with a plaintext title
- **THEN** the result is the tool error `encryption_enabled` and no op is written

#### Scenario: Decrypting bridge searches locally
- **WHEN** an assistant connected through `ot mcp --decrypt` calls `search_notes` with `query: "passport"`
- **THEN** the bridge returns the matching notes decrypted on the user's machine and the server receives no query text

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
