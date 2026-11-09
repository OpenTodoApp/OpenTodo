# notes-page Specification

## Purpose
The Notes page: one place that lists task notes, project notes and standalone notes newest change first, filters and paginates them, and searches them on the device over the decrypted text with highlighted snippets, offline included, with phone and keyboard behaviour.

## Requirements

### Requirement: Notes page
The app SHALL have a Notes page at `/notes`, loaded on first use, that lists task notes (tasks not deleted with a non-empty note, completed ones marked), project notes (projects not deleted with a non-empty note, archived ones marked) and standalone notes (not deleted) of the current workspace, from local data only, sorted by the time the note itself last changed, newest first. With the search field empty and every filter at its default, pinned standalone notes SHALL be listed first under a **Pinned** heading in the user's favourites order, and every other note under a **Recent** heading in that sorted order; without pinned notes the list SHALL have no headings. It SHALL show the first 50 of the sorted notes and a Show more control that adds the next 50, with the number shown and the total beside it. Each row SHALL show the source, the title, a one-line preview, the project, the labels and the relative time of the last change. Opening a row SHALL open the task with its note, the project with its note open for editing, or the standalone note. The page SHALL work offline and SHALL send nothing to the server. An empty page SHALL show one sentence and the New note action.

#### Scenario: Default list
- **WHEN** the user has 312 notes of all three kinds, none pinned, and opens Notes
- **THEN** the 50 most recently changed notes are listed, newest first, without headings, with "50 of 312" and Show more

#### Scenario: Pinned first
- **WHEN** the user has pinned the notes "Wi-Fi" and "Packing list" and opens Notes
- **THEN** both are listed under Pinned in the pinned order, and the other notes follow under Recent, newest first, without repeating the pinned ones

#### Scenario: Search shows one list
- **WHEN** the user with pinned notes types `ferry` in the search field
- **THEN** the results are one ranked list without the Pinned and Recent headings

#### Scenario: A task's other change does not count
- **WHEN** the user changes the due date of a task whose note was last edited a month ago
- **THEN** the task's note keeps its place in the list

#### Scenario: Offline
- **WHEN** the device is offline and the user opens Notes
- **THEN** the list is shown from local data with no request and no error

#### Scenario: Open a project note
- **WHEN** the user opens a project note from the list
- **THEN** the project opens with its note in edit mode

### Requirement: Filtering notes
The page SHALL offer the filters Source (All, Task notes, Project notes, Standalone only, Unlinked), Project and Label, each narrowing the same sorted list, paginated 50 at a time like the full list. Unlinked SHALL list the standalone notes, not deleted, that no note the user can read links to, worked out on the device as Linked references are (`note-links`), and SHALL be offered only by a build that has note links. The filters SHALL be remembered on the device. Filters and the list SHALL work offline.

#### Scenario: Only standalone in one project
- **WHEN** the user chooses Standalone only and the project "Renovation"
- **THEN** only standalone notes in "Renovation" are listed, newest first, 50 at a time

#### Scenario: Label filter
- **WHEN** the user picks the label "reference"
- **THEN** task notes and standalone notes carrying that label are listed, and project notes are not

#### Scenario: Unlinked
- **WHEN** the note "Trip" is linked from a task, the note "Ideas" links to "Trip" but nothing links to "Ideas", and the user chooses Unlinked
- **THEN** "Ideas" is listed and "Trip" is not

#### Scenario: Unlinked offline and encrypted
- **WHEN** an encrypted account is unlocked on an offline device and the user chooses Unlinked
- **THEN** the list is worked out from the decrypted local notes and no request is made

### Requirement: Searching notes on the device
The page SHALL have a search field that finds notes whose title or text contains every word typed, ignoring case and accents, with quoted words matched as a phrase and Markdown syntax ignored, over the current filters. The search SHALL run on the device over the decrypted text, offline included, and SHALL send nothing to the server. Each result SHALL show a snippet of the text around the first match with every matched word highlighted, as plain text. Results SHALL list title matches first, then by the number of matched words, then by the last change, paginated 50 at a time.

#### Scenario: Find a word in a long note
- **WHEN** a standalone note "Trip" contains "the ferry leaves at 7" and the user types `ferry`
- **THEN** "Trip" is listed with the snippet "…the **ferry** leaves at 7…", the word highlighted

#### Scenario: Accents and case
- **WHEN** a note contains "Café Müller" and the user types `cafe muller`
- **THEN** the note is found

#### Scenario: Encrypted and offline
- **WHEN** an encrypted account is unlocked on an offline device and the user searches a word that only occurs in a note's body
- **THEN** the note is found and nothing is sent

#### Scenario: Formatting ignored
- **WHEN** a note contains `**oat** milk` and the user types `"oat milk"`
- **THEN** the note is found and the snippet shows "oat milk" without asterisks

### Requirement: Notes page on phones and from the keyboard
On a phone the page SHALL show the search field at the top and the filters behind one Filters control opening a sheet, rows at least 48 px tall, and the note editor with the touch formatting row. On a computer, `g e` SHALL open Notes, and on the page `q` SHALL create a note, `/` SHALL focus the search field, and `j`, `k` and Enter SHALL move and open as in lists; every control SHALL be reachable with Tab. All page text SHALL be translated in the six app languages.

#### Scenario: Phone filters
- **WHEN** the user on a 390 px phone opens Notes and taps Filters
- **THEN** a sheet offers Source, Project and Label, and closing it shows the narrowed list

#### Scenario: Keyboard only
- **WHEN** the user presses `g e`, then `/`, types `ferry`, presses Escape, `j` and Enter
- **THEN** Notes opens, the search finds the note, focus returns to the list, and the first result opens

#### Scenario: Another language
- **WHEN** the app language is Italian and the user opens Notes with no notes
- **THEN** the page title, the empty sentence and New note are in Italian

### Requirement: Writing from the search field
While the search field holds text, the list SHALL show as its first row **New note "<text>"**. The list cursor SHALL start on the first matching note when there is one and on the New note row otherwise; Up from the first result SHALL reach the New note row, and Enter SHALL open what the cursor is on. Choosing the New note row SHALL create a standalone note titled with the trimmed text, in the project of the Project filter when one is set and otherwise without a project, clear the field, and open the note with the caret in its body: docked beside the list on a computer, as a page on a phone, where the row is at least 48 px tall. Creating SHALL work offline as a local write that syncs later, and Undo SHALL remove the note.

#### Scenario: Write right away
- **WHEN** the user presses `/` on the Notes page, types `Packing for Lisbon`, which matches no note, and presses Enter
- **THEN** a note "Packing for Lisbon" is created and open with the caret in its body, and the search field is empty

#### Scenario: Search still comes first
- **WHEN** the note "Trip" contains "ferry" and the user types `ferry` and presses Enter
- **THEN** "Trip" opens and no note is created

#### Scenario: Create although notes match
- **WHEN** the user types `ferry`, presses Up and then Enter
- **THEN** a note "ferry" is created

#### Scenario: Offline
- **WHEN** the device is offline and the user creates a note from the search field
- **THEN** the note is shown at once, survives a reload, and syncs when the network returns

### Requirement: Pinning notes
The user SHALL pin and unpin a standalone note from its row menu, from the note's own menu and from the palette while the note is open. A pin SHALL be a favourite of the kind `note`, personal to the user (never shown to other members of a shared project), synced, and kept in the user's favourites order. A pinned note that is deleted SHALL not be shown as pinned and SHALL be pinned again when restored. Task notes and project notes SHALL not be pinnable from the Notes page. Pinning SHALL work offline and converge as the favourites preference does.

#### Scenario: Pin
- **WHEN** the user chooses Pin in the menu of the note "Wi-Fi"
- **THEN** "Wi-Fi" is listed under Pinned at once and on the user's other devices after sync

#### Scenario: Personal
- **WHEN** Anna pins a note of a project shared with Bob
- **THEN** Bob's Notes page does not show it as pinned

#### Scenario: Trash and restore
- **WHEN** a pinned note is moved to the Trash and later restored
- **THEN** it leaves Pinned while in the Trash and is under Pinned again after the restore

### Requirement: The docked note's width
On a screen of at least 1024 px, the standalone note open beside the Notes list SHALL have a resize handle on its left edge, as the docked task has: dragging it SHALL set the pane's width, a click without dragging SHALL switch between the widest width and the default, and with focus on it ← SHALL widen and → SHALL narrow the pane (Shift for larger steps), and Home SHALL restore the default. The width SHALL stay between 22 rem and what leaves 38 rem for the sidebar and the list. The width SHALL be kept on the device only, never synced, apart from the docked task's width, and SHALL be applied when a note opens again on that device; storage being unavailable SHALL keep the width for the visit. The note's title, text, Project and Labels SHALL stand in one column at most 40 rem wide, centred when the pane is wider, with padding on both sides. Below 1024 px the note SHALL open as its page, unchanged. Offline it works the same, since nothing is sent; there is nothing to converge.

#### Scenario: Drag the edge
- **WHEN** the user on a 1600 px screen opens a note on the Notes page and drags the pane's left edge 120 px to the left
- **THEN** the pane is 120 px wider, and the next note opened on this device opens at that width

#### Scenario: Keyboard
- **WHEN** the user focuses the pane's edge and presses ← twice, then Home
- **THEN** the pane widens by two steps, then returns to its default width

#### Scenario: Click for the widest
- **WHEN** the user clicks the pane's edge without dragging, then clicks it again
- **THEN** the pane takes the widest width, then its default width again

#### Scenario: Apart from the task panel
- **WHEN** the user has widened the task side panel and opens a note on the Notes page
- **THEN** the note opens at its own width, and resizing it leaves the task panel's width as it was

#### Scenario: A readable column
- **WHEN** the note pane is 60 rem wide
- **THEN** the note's text stands in a centred column at most 40 rem wide

#### Scenario: Phone
- **WHEN** the user on a 390 px phone opens a note on the Notes page
- **THEN** the note opens as its page, without a resize handle
