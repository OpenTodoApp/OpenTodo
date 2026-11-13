# note-links Specification

## Purpose
Links between notes, tasks and projects: writing them with `[[`, storing them so they survive renames, encryption and older clients, rendering and degrading them, and the Linked references section that shows what links to an item, computed on the device.

## Requirements

### Requirement: Writing a link
In a task note, a project note or a standalone note, typing `[[` at the start of a block or after a space, or choosing **Link to…** in the `/` menu, SHALL open a picker of the live notes, tasks and projects of the current workspace whose title contains every word typed, ignoring case and accents, ranked by title prefix, then word matches, then most recent change, at most 8 rows, each with its kind and project. Arrow keys SHALL move, Enter SHALL insert a link to the highlighted item in place of the typed `[[text`, and Escape SHALL close the picker and keep the typed text. When the typed text matches no title exactly, the last row SHALL be **New note "<text>"**, which creates a standalone note with that title in the source's project (none for a source without a project) and inserts a link to it, in one batch with one Undo. In a note of a shared project, the picker SHALL offer only items of that project. A viewer's read-only note SHALL not open the picker. A link SHALL be one unit: the caret never enters it and Backspace after it removes it whole. Writing a link SHALL work offline as a local edit and converge like any other note edit.

#### Scenario: Link a task from a meeting note
- **WHEN** the user types `[[plum` in the note "Kitchen meeting" and presses Enter on the task "Call the plumber"
- **THEN** the note shows a link reading "Call the plumber" where `[[plum` was, and the task's page lists "Kitchen meeting" under Linked references

#### Scenario: Create the note from the picker
- **WHEN** the user types `[[Paint colours` in a task note of the project "Renovation" where no note has that title, and chooses New note "Paint colours"
- **THEN** a standalone note "Paint colours" exists in "Renovation", the task note links to it, and one Undo removes both the link and the new note

#### Scenario: Escape keeps the text
- **WHEN** the user types `[[zz` and presses Escape
- **THEN** the picker closes and `[[zz` stays in the note as text

#### Scenario: Shared project
- **WHEN** the user types `[[` in a note of the shared project "Renovation"
- **THEN** the picker lists only notes, tasks and the project of "Renovation"

#### Scenario: Offline
- **WHEN** the device is offline and the user links two notes
- **THEN** the link works at once, survives a reload, and reaches the user's other devices on the next sync

### Requirement: Links stored by id and shown with the current title
A link SHALL be stored in the note as link formatting whose address is `?note=<id>`, `?task=<id>` or `?project=<id>`, over text that is the target's title when the link was written, so the Markdown projection reads `[Title](?note=<id>)`. Wherever this build renders a note (the editor, read-only notes, previews, linked references), a link to an item the device can read SHALL read as that item's current title (an empty note title as "Untitled note"). When the user edits a note, stale link texts in it SHALL be updated to the current titles in the same edit; opening or reading a note SHALL write nothing. A plain-text write of `[text](?note=<id>)` (REST, CLI, MCP, an older client) SHALL become a link when the device folds it into the document. Links SHALL converge with the document's merge rules; two devices that update the same stale text concurrently SHALL still show one link.

#### Scenario: Rename
- **WHEN** a note links to the task "Call plumber" and the task is renamed "Call the plumber" on another device
- **THEN** after sync the link reads "Call the plumber" on every device, and the note's projection keeps the old text until the next edit of the note

#### Scenario: Projection
- **WHEN** a note links to the note "Trip" and a script reads it through the REST API
- **THEN** `description` contains `[Trip](?note=<id of Trip>)`

#### Scenario: Script writes a link
- **WHEN** an agent creates a note whose description is `See [Trip](?note=<id>)` and a device opens it
- **THEN** the note shows a link reading the current title of "Trip"

#### Scenario: Viewer reads a stale link
- **WHEN** a viewer of a shared project opens a note whose link text is older than its target's title
- **THEN** the link reads the current title and no operation is written

### Requirement: Links on older clients and plain-text readers
A note with links SHALL stay readable and editable on a client that predates links (1.0 included): it SHALL show the link text, keep the link when it edits the note, and keep `?task=` links openable as before. The projection, the export, history, webhooks, CalDAV and the Markdown vault SHALL carry links as Markdown text unchanged, and an own export imported into a new account SHALL keep its links working.

#### Scenario: 1.0 client edits a note with a link
- **WHEN** a 1.0 device adds a paragraph to a note that links to a standalone note, and syncs
- **THEN** devices of this build still show the link, and the projection still contains `(?note=<id>)`

#### Scenario: Calendar app round trip
- **WHEN** a calendar app syncs a task whose note links to a note, changes another line of the description, and the change is folded on a device
- **THEN** the link is still in the task's note

#### Scenario: Export round trip
- **WHEN** an account whose notes link to each other is exported and the file imported into an empty account
- **THEN** every link in the new account opens its target

### Requirement: Broken and unreachable links
A link whose target is missing, in the Trash, or outside what the user can read (a shared project's member and another member's personal item) SHALL read as its stored text in the muted tone and SHALL not be a link; the three cases SHALL look the same. A target restored from the Trash SHALL make its links work again. A link to an item of another workspace SHALL work and open the item. Resolution SHALL use local data only, offline included.

#### Scenario: Target in the Trash
- **WHEN** the note "Trip" is moved to the Trash and the user opens a note linking to it
- **THEN** the link reads "Trip" in the muted tone and does nothing when activated, and it works again after "Trip" is restored

#### Scenario: No access
- **WHEN** a shared project's note links to the author's personal note and another member opens it
- **THEN** the member sees the text in the muted tone and cannot tell whether the target exists

### Requirement: Opening a link
Activating a link (a click in a read-only note or a preview, Ctrl or Cmd and a click in the editor, Enter on a focused link outside the editor) SHALL open the target in the app: a task as its page or in the docked panel, a project with its list, a standalone note docked or as a page. The addresses `?note=<id>` and `?project=<id>` SHALL open their item from any page, as `?task=<id>` opens a task, and the parameter SHALL be removed from the address afterwards.

#### Scenario: Open from a note
- **WHEN** the user Ctrl-clicks a link to the project "Renovation" in a note
- **THEN** the project opens in the same tab

#### Scenario: Address
- **WHEN** the user opens `/?note=<id>` of a note they can read
- **THEN** the app opens that note over the start page and the address no longer carries `note=`

### Requirement: Linked references
A standalone note, a task and a project SHALL show a **Linked references** section listing every task note, project note and standalone note the user can read that links to it, most recently changed first, each row with its kind, title, project and a one-line plain-text snippet of the text around the link, opening the source when activated. The section SHALL be at the end of a standalone note, below a task's notes, and one folded line with the count in a project's note area whose expanded state is a per-device preference; it SHALL be hidden when nothing links to the item. It SHALL be computed on the device from the local, decrypted notes, SHALL work offline and on encrypted accounts, SHALL send nothing to the server, and SHALL update as notes change locally or arrive by sync. Every string SHALL be translated in the app's languages.

#### Scenario: Backlink appears
- **WHEN** the user links the note "Trip" from the task "Book ferry"
- **THEN** "Trip" shows "Book ferry" under Linked references with the text around the link, and activating it opens the task

#### Scenario: Removed link
- **WHEN** the user deletes the only link to "Trip"
- **THEN** the Linked references section of "Trip" is no longer shown

#### Scenario: Encrypted and offline
- **WHEN** an encrypted account is unlocked on an offline device and the user opens a note that three notes link to
- **THEN** the three are listed and no request is made

#### Scenario: Linked from another device
- **WHEN** another device links to "Trip" while this device has "Trip" open, and this device syncs
- **THEN** the new source appears in the section without a reload

#### Scenario: Project
- **WHEN** two notes link to the project "Renovation" and the user opens the project
- **THEN** its note area shows one folded line with the count 2, and expanding it lists the two notes

### Requirement: Link index fits the budgets
The device SHALL find linked references without decoding note documents and without blocking input: building the index for the notes fixture of `performance-budgets` SHALL never run a main-thread task over 200 ms, and opening a note there, with the index not yet built, to its Linked references painted SHALL stay within 200 ms on the desktop and 600 ms in the phone profile (nightly metric `note-references`). A local edit or a synced change SHALL update only the sources that changed.

#### Scenario: First open on a large account
- **WHEN** the nightly benchmark opens a linked note of the notes fixture in a fresh session
- **THEN** Linked references are painted within the metric's limit and no long task exceeds 200 ms

#### Scenario: Typing in a long note
- **WHEN** the user types in a 10 KB note of that account
- **THEN** each keystroke re-reads the links of that note only

### Requirement: Links for scripts and assistants
On an account without end-to-end encryption, the MCP tools `get_note` and `get_task` SHALL return `links` (the items the result's own text links to, with kind, id, title and whether the caller can read them) and `linked_from` (the task notes, project notes and standalone notes the caller can read that link to it), computed per call and inside `untrusted_text` for titles. On an encrypted account they SHALL return neither, and the server SHALL learn nothing about links from note text. The descriptions of the note and task write tools SHALL say how to write a link as Markdown. The CLI SHALL offer `ot notes links <ref>` (with `--json`) listing the outgoing links and linked references, computed on the user's machine over the notes the API returned; with an encrypted account and no unlocked profile it SHALL fail with `encryption_enabled`, exit 5. These reads write nothing and reflect what devices have synced.

#### Scenario: Assistant reads backlinks
- **WHEN** an MCP client calls `get_note` for "Trip" on a plaintext account where the task "Book ferry" links to it
- **THEN** `linked_from` lists "Book ferry" with kind `task`, its title inside `untrusted_text`

#### Scenario: Encrypted account
- **WHEN** an MCP client calls `get_note` on an encrypted account
- **THEN** the result has no `links` and no `linked_from`

#### Scenario: CLI
- **WHEN** the user runs `ot notes links Trip --json` with an unlocked encrypted profile
- **THEN** the envelope lists the items "Trip" links to and the notes that link to it, decrypted on the user's machine

#### Scenario: CLI locked
- **WHEN** the same command runs without `ot encryption unlock`
- **THEN** it fails with `encryption_enabled`, exit 5

### Requirement: Unlinked mentions
Below Linked references of a standalone note, a task and a project, the app SHALL show one folded line **Unlinked mentions** with a count, listing, when expanded, every task note, project note and standalone note the user can read whose text contains the item's title and that does not link to the item, most recently changed first, at most 50 then Show more, each row with its kind, title, project and the line around the first mention with the title highlighted, opening the source when activated. A mention SHALL be the whole title as whole words, ignoring case, accents and Markdown syntax, outside inline code, code blocks and the visible text of any link, and never in the item's own note; titles shorter than 3 characters after this normalisation and the default "Untitled note" SHALL never be matched. The line SHALL be hidden when the count is 0. The section SHALL be computed on the device from the local, decrypted notes, SHALL work offline and on encrypted accounts, SHALL send nothing to the server and SHALL update as notes change locally or arrive by sync; its expanded state SHALL be a per-device preference. Nothing about it SHALL be stored or synced, so convergence of notes is unchanged.

#### Scenario: A plain mention
- **WHEN** the standalone note "Lisbon ideas" reads "Ask Ana about the trip to lisbon ferry" and the user opens the note "Trip to Lisbon", which nothing links to
- **THEN** Linked references is not shown, Unlinked mentions reads 1, and expanding it lists "Lisbon ideas" with "trip to lisbon" highlighted in its line

#### Scenario: Already linked
- **WHEN** the note "Packing list" links to "Trip to Lisbon" and also names it in plain text
- **THEN** "Packing list" is listed under Linked references and not under Unlinked mentions

#### Scenario: Code and short titles
- **WHEN** a note names "Trip to Lisbon" only inside a code block, and another note is titled "Go"
- **THEN** the code block is not a mention of "Trip to Lisbon", and no note is ever listed as mentioning "Go"

#### Scenario: Encrypted and offline
- **WHEN** an encrypted account is unlocked on an offline device and the user opens a task whose title three notes mention
- **THEN** the three are counted and listed and no request is made

#### Scenario: Mentioned from another device
- **WHEN** another device adds a sentence naming "Trip to Lisbon" to a note, and this device, showing "Trip to Lisbon", syncs
- **THEN** the count grows by one without a reload

### Requirement: Linking a mention
Each row of Unlinked mentions SHALL offer **Link**, which SHALL replace that mention in the source note with a link to the item, written as an edit of the source's document in the same batch as its projection, exactly as a link written with `[[`, with one Undo. When the source changed so that the mention is no longer at its place, the device SHALL match again and link the first remaining mention, or remove the row when none is left. The source SHALL then be listed under Linked references and leave Unlinked mentions. Viewers of the source's shared project, and sources the user may not edit, SHALL show the row without Link. The edit SHALL apply locally and offline at once and converge with concurrent edits of the source under the document merge rules of `rich-text-editing`.

#### Scenario: Link one mention
- **WHEN** the user activates Link on the row "Lisbon ideas" under Unlinked mentions of "Trip to Lisbon"
- **THEN** "Lisbon ideas" reads "Ask Ana about the [Trip to Lisbon](?note=<id>) ferry", the row moves to Linked references, and Undo restores the plain text

#### Scenario: Concurrent edit of the source
- **WHEN** device A links a mention in "Lisbon ideas" while device B, offline, adds a paragraph to the same note, and both sync
- **THEN** every device shows the link and the new paragraph

#### Scenario: Viewer
- **WHEN** a viewer of a shared project sees an unlinked mention in one of that project's notes
- **THEN** the row is shown without Link

#### Scenario: Offline
- **WHEN** the device is offline and the user links a mention
- **THEN** the link is shown at once, survives a reload and is uploaded on the next successful sync

### Requirement: Unlinked mentions fit the budgets
Finding unlinked mentions SHALL not decode note documents and SHALL not block input: it SHALL run after Linked references are painted, never as a main-thread task over 200 ms on the notes fixture of `performance-budgets`, and SHALL read normalised text cached beside the link index and rebuilt only for sources that changed. Opening an item there SHALL keep the `note-references` metric within its limits.

#### Scenario: Large account
- **WHEN** the nightly benchmark opens an item of the notes fixture whose title 40 notes mention
- **THEN** Linked references are painted within the metric's limit, the count follows, and no long task exceeds 200 ms
