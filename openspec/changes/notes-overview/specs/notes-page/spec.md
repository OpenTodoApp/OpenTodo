## ADDED Requirements

### Requirement: Notes page
The app SHALL have a Notes page at `/notes`, loaded on first use, that lists task notes (tasks not deleted with a non-empty note, completed ones marked), project notes (projects not deleted with a non-empty note, archived ones marked) and standalone notes (not deleted) of the current workspace, from local data only, sorted by the time the note itself last changed, newest first. It SHALL show the first 50 and a Show more control that adds the next 50, with the number shown and the total beside it. Each row SHALL show the source, the title, a one-line preview, the project, the labels and the relative time of the last change. Opening a row SHALL open the task with its note, the project with its note open for editing, or the standalone note. The page SHALL work offline and SHALL send nothing to the server. An empty page SHALL show one sentence and the New note action.

#### Scenario: Default list
- **WHEN** the user has 312 notes of all three kinds and opens Notes
- **THEN** the 50 most recently changed notes are listed, newest first, with "50 of 312" and Show more

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
The page SHALL offer the filters Source (All, Task notes, Project notes, Standalone only), Project and Label, each narrowing the same sorted list, paginated 50 at a time like the full list. The filters SHALL be remembered on the device. Filters and the list SHALL work offline.

#### Scenario: Only standalone in one project
- **WHEN** the user chooses Standalone only and the project "Renovation"
- **THEN** only standalone notes in "Renovation" are listed, newest first, 50 at a time

#### Scenario: Label filter
- **WHEN** the user picks the label "reference"
- **THEN** task notes and standalone notes carrying that label are listed, and project notes are not

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
