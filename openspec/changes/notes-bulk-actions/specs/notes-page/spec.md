## ADDED Requirements

### Requirement: Ticking notes
In List mode the Notes page SHALL let the user tick standalone notes with the keys and gestures of task lists (`bulk-actions` "Select tasks with the keyboard" and "Select with a pointer or on touch"): `x` or Space on the cursor row, `Shift+↓`/`Shift+↑` for a range, `Ctrl`/`⌘`+click and Shift+click, the grip on touch screens, `Ctrl`/`⌘`+`A` once a note is ticked, Escape to clear, and **Select notes** in the header's overflow menu to show the checkboxes without ticking. Task notes, project notes and notes the user may only read SHALL never be ticked: a range SHALL pass over them and select-all SHALL leave them out. While notes are ticked the page SHALL show the selection bar with the count, an Actions button and Clear. Selection SHALL be device state, never an operation or synced, SHALL be cleared when the user leaves the page or switches to Graph mode, and SHALL drop a ticked note that leaves the list.

#### Scenario: Tick a range
- **WHEN** the cursor is on the standalone note "Agenda 3 Nov" and the user presses `x`, then `Shift+↓` three times over the rows "Agenda 4 Nov", the task note "Call the plumber" and "Agenda 5 Nov"
- **THEN** the three standalone notes are ticked, the task note is not, and the bar reads "3 selected"

#### Scenario: Select all skips read-only notes
- **WHEN** the list shows ten standalone notes, two of them in a project where the user is a viewer, one is ticked and the user presses `Ctrl+A`
- **THEN** eight notes are ticked

#### Scenario: Leave the page
- **WHEN** four notes are ticked and the user presses `g t`
- **THEN** Today opens, and back on Notes nothing is ticked

### Requirement: Actions on ticked notes
`.` outside text fields, or the Actions button, SHALL open a menu titled with the count offering **Move to project** (`m`), **Labels** (`Shift+L`), **Pin** or **Unpin** (`p`), **Turn into tasks** and **Move to Trash** (Delete) last in the danger colour, each with its key shown. Move to project SHALL set each note's project, and a note that would change sharing scope SHALL be copied into the new project and the original moved to the Trash, as for one note, after the review of changes that task moves show (shown only when some note changes scope). Labels SHALL follow the rule of task bulk labels: a label carried by every ticked note is removed from each, otherwise it is added to each note lacking it, each note's labels read just before writing. Pin SHALL pin every ticked note and Unpin, offered when all are pinned, SHALL unpin them, in the user's favourites. Turn into tasks SHALL turn each note into a task as the single action does. Move to Trash SHALL trash every ticked note, asking the shared confirmation first for more than twenty. Each action SHALL be written as one batch of operations applied locally first, queued while offline, and converging per note and field by last-writer-wins and the document by merging, like single edits.

#### Scenario: Move to an archive project
- **WHEN** twelve personal notes are ticked, the user presses `m` and picks the personal project "Archive"
- **THEN** the twelve notes are in Archive at once, in one batch, on every device after sync, and the toast reads "12 notes moved to Archive"

#### Scenario: Move into a shared project is reviewed
- **WHEN** two personal notes are ticked and the user moves them to the shared project "Renovation"
- **THEN** a review lists both as "copied into Renovation", marked shared; Enter copies them into Renovation and moves the originals to the Trash in one batch

#### Scenario: Label several
- **WHEN** three notes are ticked, one already labelled "reference", and the user picks "reference" with `Shift+L`
- **THEN** the other two gain "reference" and the first keeps its labels

#### Scenario: Pin several
- **WHEN** three unpinned notes are ticked and the user presses `p`
- **THEN** all three are listed under Pinned, after the notes pinned before

#### Scenario: Turn into tasks
- **WHEN** two notes in "Work" are ticked and the user chooses Turn into tasks
- **THEN** two tasks in Work carry the notes' titles, text and labels, and the two notes are in the Trash, in one batch

#### Scenario: Offline
- **WHEN** the device is offline, five notes are ticked and the user labels them "2025"
- **THEN** the labels show at once, survive a reload, and reach other devices on the next sync

#### Scenario: Concurrent edit converges
- **WHEN** a batch moves ten notes to Archive while a phone, offline, renames one of them, and both sync
- **THEN** every device shows that note in Archive with the new title

### Requirement: Undo a note bulk action
After a bulk action on notes a toast SHALL name it with an Undo control, for ten seconds, and for fifteen seconds with a "Show Trash" control after trashing; the control, or `Ctrl`/`⌘`+`Z` outside a text field while the toast shows, SHALL restore the previous values as one new batch, offline included, with the rules of `bulk-actions` "Undo a bulk action in one step": a field changed again since is skipped and its note named, the copies of a cross-scope move go to the Trash and the originals come back, and the tasks made by Turn into tasks go to the Trash and their notes come back.

#### Scenario: Undo a move
- **WHEN** the user moved twelve notes to Archive and activates Undo
- **THEN** each note is back in its previous project on every device after sync

#### Scenario: Undo turn into tasks
- **WHEN** the user turned two notes into tasks and presses `Ctrl+Z` while the toast shows
- **THEN** the two tasks are in the Trash and the two notes are back where they were

#### Scenario: Changed since
- **WHEN** the user labelled five notes, another device then removed the label from one of them, and the user activates Undo after sync
- **THEN** the label is removed from the other four and the toast names the note that was skipped
