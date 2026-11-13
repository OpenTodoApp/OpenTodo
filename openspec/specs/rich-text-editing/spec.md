# rich-text-editing Specification

## Purpose
Defines rich text for long-form fields, starting with task notes: the formatting available, how the document is stored as a mergeable value in the operation log so concurrent edits from several devices converge without losing text, and how a plain-text projection keeps the API, export and older clients working.

## Requirements

### Requirement: Rich-text notes editor
The task page (and the docked panel) SHALL edit notes as rich text supporting paragraphs, headings, bold, italic, strikethrough, inline code, links, bullet, numbered and check lists, block quotes, code blocks, tables, images from the task's attachments and mentions of members. Every formatting action SHALL be reachable from the keyboard and from a slash command menu, Markdown-style input rules SHALL apply formatting while typing, and the editor's keys SHALL be listed in the keyboard cheat sheet's editing section. Edits SHALL apply locally and offline immediately and SHALL be recorded as operations, converging with other devices under the document merge rules of this capability. The same editor SHALL be used wherever this app edits rich text (project notes, the comment composer), so a feature works the same in every place it is offered.

#### Scenario: Format with the keyboard
- **WHEN** the user selects text in the notes and presses the bold shortcut, or types `- ` at the start of a line
- **THEN** the selection becomes bold, or the line becomes a bullet item, with no mouse interaction

#### Scenario: Edit offline
- **WHEN** the device is offline and the user edits a note
- **THEN** the change is visible immediately, survives a reload, and is uploaded on the next successful sync

#### Scenario: Checklist item toggled
- **WHEN** the user toggles a check-list item in the notes
- **THEN** its checked state is saved as part of the note and shows the same on every device after sync

#### Scenario: Quote and code block
- **WHEN** the user types `> ` at the start of a line, or ```` ``` ```` and Enter
- **THEN** the line becomes a block quote, or a code block that keeps text verbatim without input rules, and the projection shows `> ` and a fenced block

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
The `description` field SHALL remain the plain-text projection of the note, rendered as Markdown, and SHALL be written in the same mutation as `notes_doc` whenever the document changes, so API clients, the export, list previews and older clients keep seeing readable text. The projection SHALL be derived deterministically from the merged document, so after convergence every device holds the same `description`. A table SHALL project to a pipe table with one line per row and `|` escaped inside cells, an image to `![alt](attachment:<id>)`, a mention to `@name`, a block quote to `> ` lines and a code block to a fenced block with its language, so the projection reparses into the same document.

#### Scenario: API reads formatted notes
- **WHEN** a note contains a heading, a bold word and a check list, and a script fetches the task through the REST API
- **THEN** `description` contains the equivalent Markdown text and `notes_doc` the encoded document

#### Scenario: Export after concurrent edits
- **WHEN** two devices edited the same note concurrently and both have synced
- **THEN** the export's `description` for that task contains the text of both edits

#### Scenario: Table projection
- **WHEN** a note holds a table with the header "Item | Cost" and one row "Paint | 40"
- **THEN** `description` contains `| Item | Cost |`, a separator row and `| Paint | 40 |`, and a PATCH of that text through the API folds back into the same table

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
When a merged document arrives while the user is editing the same note, the editor SHALL apply the remote change in place without discarding unsaved typing, without resetting the caret to the start or end, and without flashing the content. With a live update channel connected, a collaborator's change SHALL appear about 3 seconds after the collaborator stops typing (within 5 seconds against a local server), and at least once a minute while the collaborator keeps typing; without a live channel, on the next sync exchange.

#### Scenario: Co-editing one note
- **WHEN** device A is typing in a note and device B inserts text above the caret
- **THEN** device A shows B's text, A's caret stays on the character it was on, and A's in-progress typing is intact

#### Scenario: Collaborator pauses
- **WHEN** device B types a paragraph into a shared task's note and stops, while device A has the same note open with the live channel connected
- **THEN** device A shows the paragraph within 5 seconds of B's last keystroke

### Requirement: Compatibility with plain-text clients
A client that knows only `description` SHALL keep working: it SHALL continue to read readable text, its writes SHALL be folded into the document by any rich-text client that later touches the note, and it SHALL never cause the document to be rejected or reset. Rich-text clients SHALL ignore unknown formatting features from newer documents rather than failing to open the note.

#### Scenario: Older client edits a task
- **WHEN** a device running a build without rich text changes a task's `description` and syncs
- **THEN** the text appears in the note on rich-text devices and the task's other fields are unaffected

#### Scenario: Unknown formatting
- **WHEN** a newer client stores a formatting mark this client does not know
- **THEN** the note still opens and the unknown mark is preserved through the merge, not stripped

### Requirement: Slash command menu
Typing `/` at the start of a line or after a space in the editor SHALL open a menu of commands (heading 1 to 3, bullet list, numbered list, checklist, table, quote, code block, link, image, date, mention, in notes Link to… (a note, task or project, see `note-links`), and in task notes Make subtask) filtered by the letters typed after the slash. Arrow keys SHALL move, Enter SHALL apply the command and remove the typed `/` text, Escape SHALL close the menu and keep the text, and the menu SHALL close when no command matches. The menu SHALL be announced as a listbox and SHALL fit a 360 px screen.

#### Scenario: Insert a table by keyboard
- **WHEN** the user types `/tab` and presses Enter
- **THEN** a two-column, two-row table with a header row is inserted at the caret, the `/tab` text is gone and the caret is in the first header cell

#### Scenario: No match
- **WHEN** the user types `/zzz`
- **THEN** the menu is closed and the text `/zzz` stays in the note

#### Scenario: Date
- **WHEN** the user types `/date`, chooses Date and presses Enter
- **THEN** today's date in the user's date format is inserted as text

#### Scenario: Link to a note
- **WHEN** the user types `/link to` in a standalone note and presses Enter
- **THEN** the `/link to` text is gone and the picker of notes, tasks and projects is open at the caret

#### Scenario: Not in comments
- **WHEN** the user opens the `/` menu in the comment composer
- **THEN** it offers no Link to… entry

### Requirement: Tables
The editor SHALL insert and edit tables of inline-only cells, with a header row, at most 10 columns and 100 rows; Tab and Shift+Tab SHALL move between cells (adding a row at the end), and row and column commands (add before or after, delete, toggle header) SHALL be reachable from the cell's context menu and the slash menu. The editor SHALL refuse to exceed the limits rather than produce a document the projection cannot hold, and a table SHALL scroll inside its own box on narrow screens rather than widen the panel. Tables are part of the mergeable document and converge like every other node.

#### Scenario: Concurrent cell edits
- **WHEN** device A writes in cell (1,1) and device B writes in cell (2,2) of the same table while offline, then both sync
- **THEN** both cells hold their text on every device and the table has the same shape everywhere

#### Scenario: Column limit
- **WHEN** a table has 10 columns and the user chooses Add column after
- **THEN** nothing is added and the editor says the limit is 10 columns

#### Scenario: Narrow screen
- **WHEN** a note with a six-column table is opened at 360 px
- **THEN** the table scrolls sideways inside its box and the page does not scroll horizontally

### Requirement: Images from attachments
Dropping or pasting an image into the editor, or choosing Image from the slash menu, SHALL attach the file to the task through the attachments capability and insert an image node that names the attachment, as one undoable change; the editor SHALL show the image from the app's own authenticated attachment route, or from the bytes decrypted on the device for an encrypted account, a placeholder with the file name while the attachment is uploading or waiting, "Encrypted image" on a locked device, and "Removed image" when the attachment was removed. Images SHALL have an editable alternative text, SHALL be selectable and deletable from the keyboard, and SHALL never be loaded from an address outside the app's origin; an image address pasted from the web SHALL become a link.

#### Scenario: Paste a screenshot into a note
- **WHEN** the user pastes an image from the clipboard while the caret is in the notes
- **THEN** an attachment named with the date and `.png` is created and queued, the note shows the image at the caret, the projection contains `![…](attachment:<id>)`, and another device shows the image once the bytes are uploaded and it has synced

#### Scenario: Encrypted account
- **WHEN** an encrypted account embeds a photo and opens the note on another unlocked device
- **THEN** the device downloads the encrypted bytes, decrypts them and shows the image, and the server served only ciphertext

#### Scenario: Attachment removed
- **WHEN** the embedded attachment is removed from the task
- **THEN** the note shows "Removed image" in its place on every device and the user can delete the placeholder

#### Scenario: Web image stays a link
- **WHEN** the user pastes `https://example.org/photo.jpg`
- **THEN** the note gets a link to that address, no image is loaded, and no request is made to example.org

### Requirement: Checklist items become subtasks
On a check-list line, or a selection holding check-list lines, in a task's notes the editor SHALL offer Make subtask (slash menu, context menu and a key combination registered in the shortcut registry); it SHALL create one subtask of the task per check-list line with the line's text as title, the task's project, and the line's checked state as completion. In a project's note and in a standalone note the same command, the same key and the same menus SHALL offer Make tasks: one task per check-list line, its line read with quick-add syntax (a date, a priority, labels), in the project of the note (a standalone note without a project: the Inbox of the note's workspace), with the line's checked state as completion. Either command SHALL replace each line with a paragraph holding a link to its task, and SHALL be one change that Undo reverts in one step, the tasks and the note together. Lines of the selection that are not check-list lines, and lines that already hold only a link to a task, SHALL be left as they are; one command SHALL turn at most 50 lines and say so when the selection holds more. The link SHALL show the task's current title and done state when the task is on the device, and the stored text otherwise, so the note's Linked references and the task's Linked references connect the two. The tasks and the note change SHALL be written as local operations in one batch, offline included, and SHALL converge like any task creation and note edit: a concurrent edit of the same note on another device merges with the replaced lines. Viewers of a shared project SHALL not be offered either command. The commands SHALL not be offered in comments.

#### Scenario: Make subtask offline
- **WHEN** the device is offline and the user chooses Make subtask on the line "Book hotel"
- **THEN** "Book hotel" appears as a subtask under the task at once, the line reads as a link to it, and both reach other devices on the next sync

#### Scenario: Undo
- **WHEN** the user presses Undo right after Make subtask
- **THEN** the subtask is gone and the checklist line is back with its text and state

#### Scenario: Subtask retitled
- **WHEN** the subtask is renamed on another device and this one syncs
- **THEN** the link in the note shows the new title without a write to the note

#### Scenario: Meeting note to tasks
- **WHEN** the user selects three lines of the standalone note "Planning meeting" in Work, "[ ] book room friday", "notes from Anna" and "[ ] send agenda p1", and presses Ctrl+Shift+Enter
- **THEN** two tasks are created in Work, "book room" due Friday and "send agenda" with priority 1, the two lines read as links to them, "notes from Anna" is unchanged, and the note's Linked references list nothing new while each task's Linked references list the note

#### Scenario: Several subtasks at once
- **WHEN** the user selects four check-list lines in the note of the task "Move house" and chooses Make subtask
- **THEN** four subtasks of "Move house" are created and Undo removes all four and restores the lines

#### Scenario: Concurrent edit
- **WHEN** the user makes tasks from two lines of a project note offline while another member adds a paragraph to the same note, and both sync
- **THEN** every device shows the two links and the new paragraph, and the two tasks exist once

#### Scenario: Viewer
- **WHEN** a viewer of a shared project selects check-list lines in its project note
- **THEN** neither Make tasks nor Make subtask is offered

#### Scenario: Too many lines
- **WHEN** the user selects 70 check-list lines and chooses Make tasks
- **THEN** the first 50 become tasks and the editor says 20 lines were left

### Requirement: Recognised issue links
A link in a note or comment whose address is a GitHub, GitLab, Jira or Linear issue, recognised on the device the way a task's origin is, SHALL render as an inline issue chip (`o/r#7`, `ENG-123`) that opens the issue in a new tab; recognition SHALL use the address alone and SHALL make no request. Every other link renders as a link.

#### Scenario: Issue chip
- **WHEN** a note contains `https://github.com/OpenTodoApp/OpenTodo/issues/198`
- **THEN** it renders as a chip reading `OpenTodoApp/OpenTodo#198`, no request leaves the device, and the projection keeps the plain address

### Requirement: Mentions in notes
A task's notes MAY mention project members as `@name`; the editor SHALL offer completion from the local membership cache, and the device SHALL write the mentioned account ids to an additive `note_mentions` list on the task in the same mutation as the note. The server SHALL keep only mentions of current members of the task's shared project (none on a personal task) and SHALL notify each account newly listed, naming the actor, the task and that the mention is in its notes; an account already listed SHALL NOT be notified again by later edits. Mentions converge like any other node of the document, and the id list converges by last-writer-wins.

#### Scenario: Mention in a note
- **WHEN** Alice types `@Bo` in the notes of a shared task, picks Bob and the note saves
- **THEN** `note_mentions` contains Bob's id, Bob receives an unread notification naming Alice and the task "in its notes" after his next sync, and the projection reads `@Bob`

#### Scenario: Edited note does not re-notify
- **WHEN** Alice fixes a typo in the same note later
- **THEN** Bob receives no new notification

#### Scenario: Non-member dropped
- **WHEN** a device submits `note_mentions` with an id that is not a member of the project
- **THEN** that id is dropped from the stored list, the note is kept, and nobody is notified for it

### Requirement: Editing toolbar on touch screens
On a coarse pointer, while the editor has focus, one row of formatting controls (bold, italic, link, bullet list, checklist, and a More menu with the remaining commands) SHALL be shown above the editor inside the panel's own scroller; it SHALL not be shown at rest on a coarse pointer, it SHALL be shown on a fine pointer only through the Formatting toggle (`Formatting toggle on computers`, and the comment composer's toggle), it SHALL never be a new chrome row of any page, and every control SHALL have an accessible name. The row SHALL be a toolbar named "Formatting" that is one Tab stop, moves between its controls with the arrow keys, Home and End, and returns focus to the editor on Escape.

#### Scenario: Phone editing
- **WHEN** the user taps into the notes on a phone
- **THEN** the toolbar row appears above the notes, tapping Bold applies bold to the selection, and leaving the notes hides the row

#### Scenario: Arrow keys in the row
- **WHEN** focus is on the row's Bold control and the user presses Right, then End
- **THEN** focus moves to Italic, then to the More menu, and Tab leaves the row in one step

### Requirement: Note push cadence
The note editor (task notes, project notes and every later note that uses it) SHALL save the document and its projection on the device after every pause in typing, as before, and SHALL send a saved document to the server 3 seconds after the last save while no further save happened, at once when the editor loses focus, is closed, or the app navigates away, when the page is hidden or unloaded, and at least every 60 seconds while the person keeps typing without such a pause. A sync exchange that runs for any other reason SHALL carry the pending document too. The device SHALL keep at most one pending document per note, the newest. Offline, saves SHALL stay on the device and SHALL be sent on the next successful exchange; convergence SHALL be unchanged, since every sent document is a full state that includes every earlier save of that device. The comment composer SHALL keep its behaviour: it sends a comment only when the person submits it.

#### Scenario: Typing with short pauses
- **WHEN** the user types in a note for 30 seconds with pauses of about one second
- **THEN** the note survives a reload at any moment, and no note document is sent until the user pauses for 3 seconds

#### Scenario: Pause sends the note
- **WHEN** the user stops typing in a note and does nothing for 3 seconds
- **THEN** one note document with the latest text is sent to the server

#### Scenario: Continuous typing
- **WHEN** the user types without a 3-second pause for two and a half minutes
- **THEN** the note document is sent at least twice during that time, the newest state each time

#### Scenario: Leaving the note
- **WHEN** the user types a sentence and at once closes the task, opens another one, or switches to another app
- **THEN** the document is sent at once, without waiting for the 3 seconds

#### Scenario: Another edit carries the note
- **WHEN** the user types in a note and, within a second, changes the task's due date
- **THEN** the exchange for the due date also carries the note's latest document

#### Scenario: Offline writing
- **WHEN** the device is offline and the user writes in a note for ten minutes, then reconnects
- **THEN** one document with the latest text is sent on the next exchange, and every device shows it after sync

#### Scenario: Comments unchanged
- **WHEN** the user types a comment and waits 3 seconds without sending
- **THEN** nothing is sent to the server and the draft stays on the device

### Requirement: Formatting toggle on computers
On a fine pointer, every note the user may edit (task notes on the task page and in the docked panel, project notes, and every later note that uses the same editor) SHALL show a Formatting toggle at the note's top end corner, visible while the pointer is over the note or focus is within it and always while pressed, in the Tab order just before the note's text. Activating it SHALL show the formatting row above the note, at rest as well as while the note has focus, inside the panel's or page's own scroller; activating it again SHALL hide the row. Whether the row is shown SHALL be remembered on the device for notes, separately from the comment composer, and SHALL be the same in every note on that device. The toggle SHALL be a button named "Formatting" whose pressed state is announced; buttons in the row SHALL keep the note's selection and return focus to the note. Read-only notes SHALL show no toggle. Nothing about the toggle is stored in the note or synced, so offline behaviour and convergence of notes are unchanged.

#### Scenario: Bold with the mouse
- **WHEN** the user on a computer hovers a task's note, activates the Formatting toggle, selects a word in the note and activates Bold in the row
- **THEN** the word is bold, the toggle is announced as pressed, and the row stays shown above the note

#### Scenario: Remembered on the device
- **WHEN** the user turns the row on in one task's note and later opens a project's note on the same computer
- **THEN** the project note shows the row with the toggle pressed, and another computer of the same account does not

#### Scenario: Keyboard only
- **WHEN** the user presses Shift+Tab from inside a note, presses Enter on the Formatting toggle, then Tab into the row and Right twice
- **THEN** the row is shown, focus moves to the toggle, then to the row's first control and then to Link, and Escape returns focus to the note with its selection

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens a task's note on a computer
- **THEN** no Formatting toggle is shown

#### Scenario: Phone unchanged
- **WHEN** the user taps into a note on a phone
- **THEN** no toggle is shown and the row appears while the note has focus, as before

### Requirement: Formatting button setting
Settings › Account › Profile › How you work SHALL have a Formatting button switch, on by default, stored as the synced additive preference `user_prefs.formatting_toggle` (`off` hides; empty or any other value shows, and is not rewritten). While it is off, the Formatting toggle SHALL not be shown in notes or in the comment composer on a fine pointer and the formatting row SHALL not be shown there, whatever the device remembered; keyboard shortcuts, Markdown input rules and the slash menu SHALL keep working, and touch screens SHALL keep their row. The preference SHALL be written offline and converge by last-writer-wins like every preference.

#### Scenario: Turned off on one device, everywhere
- **WHEN** the user turns the Formatting button off on a laptop and later opens a note on a desktop computer after sync
- **THEN** the desktop shows no Formatting toggle beside the note or in the composer

#### Scenario: Remembered row comes back
- **WHEN** the user had the row shown in notes, turns the switch off, and later turns it on again
- **THEN** the toggle is back, pressed, and the row is shown again

#### Scenario: Offline change
- **WHEN** the device is offline and the user turns the switch off
- **THEN** the toggle disappears at once, and the preference reaches the other devices on the next sync

### Requirement: Appended text merges into the document
Tasks and notes SHALL carry an additive field family `appends.<id>` whose non-empty values are Markdown text waiting to be added at the end of the note. A plain-text writer that only adds text (the CLI, MCP, the append routes) SHALL write one new key and SHALL NOT write `description` or `notes_doc`, so no existing text is replaced. Every device that holds the note SHALL, when it applies such a value and before any local write of the note, insert the text parsed as Markdown at the end of the visible body as a document insertion whose every block carries the append's id, and publish the document and projection with that key set to `""` in the same batch. A device SHALL NOT fold an append whose block is already in its merged document, and when a merge holds more than one block with the same append id, every device SHALL keep only the copy whose first block has the smallest document item id and delete the blocks of the others, so all devices converge on one copy. Until a device folds it, the REST API, the export, MCP and the CLI SHALL show the note as its projection followed by its pending appends in clock order. The server SHALL accept a non-empty value only for a key that has none yet, `""` from anyone who may write the entity, at most 100 pending appends per entity, and a projection plus pending appends of at most 64 KB. A fold that would exceed the document size limit SHALL NOT be done and the append stays pending. Offline devices fold appends they receive when they sync; an append made in the web app itself is a direct document edit. Clients that do not know the family SHALL ignore it.

#### Scenario: Append while a phone edits offline
- **WHEN** a script appends "- ship Friday" to a note while a phone, offline, adds a paragraph in the middle of the same note, and the phone syncs later
- **THEN** every device shows the phone's paragraph and "ship Friday" at the end, once

#### Scenario: Two devices fold at once
- **WHEN** two online devices both receive the same append and fold it before seeing each other's document
- **THEN** after they sync every device shows the appended text exactly once

#### Scenario: Readable before any device folds
- **WHEN** a script appends text to a task's note and no device has synced since
- **THEN** `GET /api/v1/tasks/{id}` and MCP `get_note` show the note's text followed by the appended text

#### Scenario: An append is written once
- **WHEN** a client sends a second non-empty value for an append id that already has one
- **THEN** the op is refused and the stored append is unchanged

### Requirement: Plain-text replacement checks the version
A read of a task, project or note through the REST API SHALL return `body_version`, the greatest clock among its `description`, `notes_doc` and `appends` keys. A `PATCH` that writes `description` with `If-Match` SHALL be refused with 409 `body_changed`, carrying the current version and writing nothing, when the stored version differs, checked in the same transaction as the write. A `PATCH` without `If-Match` SHALL behave as before. An accepted replacement SHALL become the document by the fold-back rule, on whichever device next opens the note, offline included, and all devices converge through the merge rules.

#### Scenario: Version matches
- **WHEN** the CLI reads a note and patches its `description` with `If-Match` set to the version it read, and nothing changed meanwhile
- **THEN** the write is accepted and the next device that opens the note shows the new text as formatted content

#### Scenario: Version is stale
- **WHEN** a device saved an edit to the note after the CLI read it and the CLI then patches with the old version
- **THEN** the response is 409 `body_changed` and the device's edit stays

#### Scenario: Unauthenticated patch
- **WHEN** a request without credentials patches a note's `description` with `If-Match`
- **THEN** the response is 401 `unauthorized` and nothing is written

### Requirement: Outline of a note
A task note, project note or standalone note with 3 or more top-level headings SHALL show its outline: the headings of levels 1 to 3 in document order, indented by level, with the heading currently at the top of the reading area marked and announced as the current location. Choosing a heading SHALL scroll the note to it and, in a note the user may edit, put the caret at its start. When the note's column is at least 52 rem wide the outline SHALL be a column beside the note that stays in view while the note scrolls, inside the existing scroller and never as a scroll region of its own; otherwise, and always in the docked task panel and in project notes, it SHALL be an **Outline** button in the note's top corner opening a menu of the headings. Notes with fewer than 3 headings SHALL show neither. The outline SHALL follow local and remote edits at once, SHALL work offline and on encrypted accounts from the local, decrypted document, and SHALL not be stored or synced, so offline behaviour and convergence of notes are unchanged.

#### Scenario: Jump to a section
- **WHEN** a standalone note on a 1440 px screen has the headings "Flights", "Hotels" and "Days" and the user chooses "Days" in the outline column
- **THEN** the note scrolls so that "Days" is at the top, the caret is at its start, and "Days" is marked as current

#### Scenario: Docked panel
- **WHEN** a task note in the docked panel has four headings
- **THEN** the note shows an Outline button, and its menu lists the four headings

#### Scenario: Short note
- **WHEN** a note has two headings
- **THEN** no outline column and no Outline button are shown

#### Scenario: Remote heading
- **WHEN** another device adds a heading "Budget" to a note open on this device with an outline, and this device syncs
- **THEN** "Budget" appears in the outline at its place without a reload

#### Scenario: Read-only
- **WHEN** a viewer of a shared project chooses a heading in a project note's outline
- **THEN** the note scrolls to the heading and focus moves to it, and the note stays read-only

### Requirement: Outline from the keyboard
While a note with an outline has focus, `Ctrl+Shift+O` (`⌘+Shift+O` on a Mac) SHALL move focus to the outline column or open the outline menu; ↑ and ↓ SHALL move between headings, Home and End to the first and last, Enter SHALL go to the focused heading and Esc SHALL return focus to the note where it was. The shortcut SHALL be registered in the keyboard registry's editing section without a conflict and listed in the cheat sheet.

#### Scenario: Keyboard only
- **WHEN** the user presses `Ctrl+Shift+O` in a note with five headings, presses ↓ twice and Enter
- **THEN** the note scrolls to the third heading with the caret at its start

#### Scenario: Esc returns
- **WHEN** the user opens the outline with the keyboard and presses Esc
- **THEN** focus is back in the note at the same caret position

### Requirement: Markdown source mode
Every note the user may edit (task notes on the task page and in the docked panel, project notes and standalone notes) SHALL offer a Markdown source mode that shows the note's plain-text projection as editable monospace text in the note's place, reached with `Ctrl+Shift+M` (`⌘+Shift+M` on a Mac) while the note has focus, with a **Markdown** entry in the slash menu, and on a fine pointer with a **Markdown** button beside the Formatting toggle, revealed with it and announced with its pressed state. The same key or button SHALL return to rich text with the caret in the block that held it. The mode SHALL last until the note is closed and SHALL not be stored or synced. A read-only note SHALL show its source read-only. The shortcut SHALL be registered in the keyboard registry's editing section without a conflict.

#### Scenario: Open the source
- **WHEN** the user presses `Ctrl+Shift+M` in a note holding a heading "Plan" and a check list
- **THEN** the note shows `# Plan` and `- [ ] ` lines as plain text, and pressing `Ctrl+Shift+M` again shows the heading and the check list as rich text

#### Scenario: Fix a list
- **WHEN** in source mode the user changes `1. milk` to `- milk` and returns to rich text
- **THEN** the line is a bullet item, on every device after sync

#### Scenario: Viewer
- **WHEN** a viewer of a shared project switches a project note to its source
- **THEN** the source is shown and cannot be edited

#### Scenario: Not remembered
- **WHEN** the user closes a note in source mode and opens it again
- **THEN** it opens as rich text

### Requirement: Source edits apply block by block
Edits made in source mode SHALL be applied to the note's document at each local save pause and on leaving the mode by replacing, inserting or deleting only the top-level blocks whose text differs from the projection, so unchanged blocks keep their nodes (mentions, images from attachments, tables) and the projection is written in the same batch. Each application SHALL be an ordinary document edit: it SHALL apply locally and offline at once, survive a reload, and converge with concurrent edits from other devices under "Concurrent note edits converge without loss". Remote edits arriving while the source is shown SHALL update the source text in the blocks the user has not changed since the last pause without moving the caret or selection.

#### Scenario: Concurrent edit kept
- **WHEN** device A edits the second paragraph of a note in source mode while device B, online, adds a fourth paragraph, and device A returns to rich text
- **THEN** every device shows A's change to the second paragraph and B's fourth paragraph

#### Scenario: Untouched mention kept
- **WHEN** a task note holds a paragraph with a mention of Anna and the user changes only another paragraph in source mode
- **THEN** the mention is still a mention after leaving source mode

#### Scenario: Remote edit while typing
- **WHEN** the user types in the first paragraph in source mode and another device changes the last paragraph
- **THEN** the source shows the new last paragraph and the caret stays where the user was typing

#### Scenario: Offline
- **WHEN** the device is offline and the user edits a note in source mode and reloads
- **THEN** the edit is shown and is uploaded on the next successful sync
