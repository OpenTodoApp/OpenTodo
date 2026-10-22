## MODIFIED Requirements

### Requirement: Rich-text notes editor
The task detail panel SHALL edit notes as rich text supporting paragraphs, headings, bold, italic, strikethrough, inline code, links, bullet, numbered and check lists, block quotes, code blocks, tables, images from the task's attachments and mentions of members. Every formatting action SHALL be reachable from the keyboard and from a slash command menu, Markdown-style input rules SHALL apply formatting while typing, and the editor's keys SHALL be listed in the keyboard cheat sheet's editing section. Edits SHALL apply locally and offline immediately and SHALL be recorded as operations, converging with other devices under the document merge rules of this capability. The same editor SHALL be used wherever this app edits rich text (project notes, the comment composer), so a feature works the same in every place it is offered.

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

## ADDED Requirements

### Requirement: Slash command menu
Typing `/` at the start of a line or after a space in the editor SHALL open a menu of commands (heading 1 to 3, bullet list, numbered list, checklist, table, quote, code block, link, image, date, mention, and in notes Make subtask) filtered by the letters typed after the slash. Arrow keys SHALL move, Enter SHALL apply the command and remove the typed `/` text, Escape SHALL close the menu and keep the text, and the menu SHALL close when no command matches. The menu SHALL be announced as a listbox and SHALL fit a 360 px screen.

#### Scenario: Insert a table by keyboard
- **WHEN** the user types `/tab` and presses Enter
- **THEN** a two-column, two-row table with a header row is inserted at the caret, the `/tab` text is gone and the caret is in the first header cell

#### Scenario: No match
- **WHEN** the user types `/zzz`
- **THEN** the menu is closed and the text `/zzz` stays in the note

#### Scenario: Date
- **WHEN** the user types `/date`, chooses Date and presses Enter
- **THEN** today's date in the user's date format is inserted as text

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
On a check-list line in a task's notes the editor SHALL offer Make subtask (slash menu, context menu and a key combination registered in the shortcut registry); it SHALL create a subtask of the task with the line's text as title, the task's project, and the line's checked state as completion, and replace the line with a paragraph holding a link to the subtask, as one change that Undo reverts in one step. The link SHALL show the subtask's current title and done state when the subtask is on the device, and the stored text otherwise. The command SHALL not be offered in project notes or comments.

#### Scenario: Make subtask offline
- **WHEN** the device is offline and the user chooses Make subtask on the line "Book hotel"
- **THEN** "Book hotel" appears as a subtask under the task at once, the line reads as a link to it, and both reach other devices on the next sync

#### Scenario: Undo
- **WHEN** the user presses Undo right after Make subtask
- **THEN** the subtask is gone and the checklist line is back with its text and state

#### Scenario: Subtask retitled
- **WHEN** the subtask is renamed on another device and this one syncs
- **THEN** the link in the note shows the new title without a write to the note

### Requirement: Recognised issue links
A link in a note or comment whose address is a GitHub, GitLab, Jira or Linear issue, recognised on the device the way a task's origin is, SHALL render as an inline issue chip (`o/r#7`, `ENG-123`) that opens the issue in a new tab; recognition SHALL use the address alone and SHALL make no request. Every other link renders as a link.

#### Scenario: Issue chip
- **WHEN** a note contains `https://github.com/pixari/opentodo/issues/198`
- **THEN** it renders as a chip reading `pixari/opentodo#198`, no request leaves the device, and the projection keeps the plain address

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
On a coarse pointer, while the editor has focus, one row of formatting controls (bold, italic, link, bullet list, checklist, and a More menu with the remaining commands) SHALL be shown above the editor inside the panel's own scroller; it SHALL not be shown at rest, on fine pointers, or as a new chrome row of any page, and every control SHALL have an accessible name.

#### Scenario: Phone editing
- **WHEN** the user taps into the notes on a phone
- **THEN** the toolbar row appears above the notes, tapping Bold applies bold to the selection, and leaving the notes hides the row
