## MODIFIED Requirements

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

## ADDED Requirements

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
