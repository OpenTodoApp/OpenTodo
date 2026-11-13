## MODIFIED Requirements

### Requirement: Notes page
The app SHALL have a Notes page at `/notes`, loaded on first use, that lists task notes (tasks not deleted with a non-empty note, completed ones marked), project notes (projects not deleted with a non-empty note, archived ones marked) and standalone notes (not deleted) of the current workspace, from local data only, sorted by the time the note itself last changed, newest first. With no words and no token in the search field, pinned standalone notes SHALL be listed first under a **Pinned** heading in the user's favourites order, and every other note under a **Recent** heading in that sorted order; without pinned notes the list SHALL have no headings. It SHALL show the first 50 of the sorted notes and a Show more control that adds the next 50, with the number shown and the total beside it. Each row SHALL be one line on a row grid shared by every row: the kind icon, the title, where the note lives (the standalone note's project, the task's project or Inbox, the project of a project note), its labels as at most two chips then "+n" in the style of task rows, and the relative time of the last change, right-aligned. Opening a row SHALL open the task with its note, the project with its note open for editing, or the standalone note. The page SHALL work offline and SHALL send nothing to the server. An empty page SHALL show one sentence and the New note action. The header SHALL hold the title, the note count, New note and Help, and SHALL keep a place among its actions for a view switch of the Notes page.

#### Scenario: Default list
- **WHEN** the user has 312 notes of all three kinds, none pinned, and opens Notes
- **THEN** the 50 most recently changed notes are listed, newest first, without headings, with "50 of 312" and Show more

#### Scenario: Pinned first
- **WHEN** the user has pinned the notes "Wi-Fi" and "Packing list" and opens Notes
- **THEN** both are listed under Pinned in the pinned order, and the other notes follow under Recent, newest first, without repeating the pinned ones

#### Scenario: Search shows one list
- **WHEN** the user with pinned notes types `ferry` in the search field
- **THEN** the results are one ranked list without the Pinned and Recent headings

#### Scenario: One line per note
- **WHEN** a task note of "Call the plumber" in the project "Home" with the labels "errand" and "phone", changed two hours ago, is listed on a 1280 px screen
- **THEN** its row is one line with the task icon, "Call the plumber", "Home", the chips "errand" and "phone", and "2 h ago" at the row's end, aligned with the same columns of the rows above and below

#### Scenario: Where a note lives
- **WHEN** the list holds a standalone note in "Renovation", a task note of a task without a project and a project note of "Garden"
- **THEN** their rows read "Renovation", "Inbox" and "Garden" in the place column

#### Scenario: A task's other change does not count
- **WHEN** the user changes the due date of a task whose note was last edited a month ago
- **THEN** the task's note keeps its place in the list

#### Scenario: Offline
- **WHEN** the device is offline and the user opens Notes
- **THEN** the list is shown from local data with no request and no error

#### Scenario: Open a project note
- **WHEN** the user opens a project note from the list
- **THEN** the project opens with its note in edit mode

### Requirement: Searching notes on the device
The page SHALL have a search field that finds notes whose title or text contains every word typed, ignoring case and accents, with quoted words matched as a phrase and Markdown syntax ignored, among the notes the field's tokens keep. The search SHALL run on the device over the decrypted text, offline included, and SHALL send nothing to the server. Each result SHALL show, on its one line after the title, a snippet of the text around the first match with every matched word highlighted, as plain text. Results SHALL list title matches first, then by the number of matched words, then by the last change, paginated 50 at a time.

#### Scenario: Find a word in a long note
- **WHEN** a standalone note "Trip" contains "the ferry leaves at 7" and the user types `ferry`
- **THEN** "Trip" is listed with the snippet "…the **ferry** leaves at 7…" after its title on the same line, the word highlighted

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
On a phone the page SHALL show the search field with its chips at the top, the token suggestions in the same list under the field, rows at least 48 px tall and one line each (the kind icon, the title, where the note lives and the time; the labels left to the note), and the note editor with the touch formatting row. On a computer, `g e` SHALL open Notes, and on the page `q` SHALL create a note, `/` SHALL focus the search field, and `j`, `k` and Enter SHALL move and open as in lists; every control SHALL be reachable with Tab, every chip's remove button included. All page text SHALL be translated in the app languages.

#### Scenario: Phone filters
- **WHEN** the user on a 390 px phone opens Notes, types `in:ren` and taps "Renovation" in the suggestions
- **THEN** a chip "in: Renovation" is in the field, the list shows only notes in Renovation, and every row is one line at least 48 px tall

#### Scenario: Keyboard only
- **WHEN** the user presses `g e`, then `/`, types `ferry`, presses Escape, `j` and Enter
- **THEN** Notes opens, the search finds the note, focus returns to the list, and the first result opens

#### Scenario: Another language
- **WHEN** the app language is Italian and the user opens Notes with no notes
- **THEN** the page title, the empty sentence and New note are in Italian

### Requirement: Writing from the search field
While the search field holds words, the list SHALL show as its first row **New note "<words>"**. The list cursor SHALL start on the first matching note when there is one and on the New note row otherwise; Up from the first result SHALL reach the New note row, and Enter SHALL open what the cursor is on. Choosing the New note row SHALL create a standalone note titled with the trimmed words, in the project of the first `in:` chip when there is one the user may write in and otherwise without a project, with the labels of the label chips, clear the words (the chips stay), and open the note with the caret in its body: docked beside the list on a computer, as a page on a phone, where the row is at least 48 px tall. Creating SHALL work offline as a local write that syncs later, and Undo SHALL remove the note.

#### Scenario: Write right away
- **WHEN** the user presses `/` on the Notes page, types `Packing for Lisbon`, which matches no note, and presses Enter
- **THEN** a note "Packing for Lisbon" is created and open with the caret in its body, and the search field is empty

#### Scenario: Search still comes first
- **WHEN** the note "Trip" contains "ferry" and the user types `ferry` and presses Enter
- **THEN** "Trip" opens and no note is created

#### Scenario: Create although notes match
- **WHEN** the user types `ferry`, presses Up and then Enter
- **THEN** a note "ferry" is created

#### Scenario: Into the chips' project and labels
- **WHEN** the field holds the chips "in: Renovation" and "@ quotes" and the user types `Tiles` and presses Enter
- **THEN** a note "Tiles" is created in Renovation with the label "quotes", and the two chips stay in the field

#### Scenario: Offline
- **WHEN** the device is offline and the user creates a note from the search field
- **THEN** the note is shown at once, survives a reload, and syncs when the network returns

## ADDED Requirements

### Requirement: Search tokens
The search field SHALL accept filter tokens beside words, each shown as a chip with a remove button once complete: `in:<project>` or `#<project>` (the note lives in that project or a sub-project of it: a standalone note's own project, a task note's task's project, a project note's project), `@<label>` or `label:<label>` (the standalone note or the task carries that label), `kind:note`, `kind:task` or `kind:project`, `linked:<note>` (the items linked with that standalone note in either direction, as Linked references and the note's links read them, `note-links`), `orphan` (standalone notes nothing the user can read links to), `pinned` (pinned standalone notes), and `changed:` followed by `<` or `>` and a number of days, weeks or months (`<7d`, `>2w`, `>3m`), by `today` or `yesterday`, or by a date `YYYY-MM-DD` with an optional `<` or `>` (on, before or after that day in the viewer's day). Names SHALL match ignoring case and accents and MAY be quoted. Tokens of different keys SHALL all apply; tokens of the same key SHALL keep a note that matches any of them. A token SHALL become a chip when it is complete and followed by a space, when it is picked from the suggestions or when it is pasted; Backspace in an empty field SHALL remove the last chip. While a token's value is typed, the matching values SHALL be suggested under the field (projects with their path, labels with their colour, standalone notes by title, the kinds, date forms), moved through with the arrows and picked with Enter, Tab or a click; while a word of two letters or more starts a key, the key SHALL be suggested and Tab SHALL complete it, without changing what Enter does. A chip SHALL keep naming its project, label or note after a rename, and SHALL match nothing once it is deleted. The chips, not the words, SHALL be remembered on the device; filters stored by an earlier version SHALL be converted once into chips. Tokens SHALL be matched on the device over local data and decrypted text, offline included, and SHALL send nothing to the server; there is nothing to converge beyond the notes, labels and projects themselves.

#### Scenario: Project with sub-projects
- **WHEN** the project "House" has the sub-project "Kitchen", and the user types `in:House ` in the search field
- **THEN** a chip "in: House" replaces the text, and the list keeps the notes of tasks in House and Kitchen, the standalone notes in either and the project notes of both

#### Scenario: Labels like the task filter
- **WHEN** a standalone note and a task note carry the label "errand" and the user types `@err`, then picks "errand" from the suggestions
- **THEN** a chip "@ errand" is in the field and both notes are listed, and project notes are not

#### Scenario: Two labels
- **WHEN** the field holds the chips "@ errand" and "@ phone"
- **THEN** notes with either label are listed

#### Scenario: Kind and age
- **WHEN** the user types `kind:note changed:<7d `
- **THEN** two chips are in the field and only standalone notes changed in the last seven days are listed

#### Scenario: Linked with a note
- **WHEN** the note "Trip" links to "Packing list" and is linked from the task "Book ferry", and the user picks "Trip" after `linked:`
- **THEN** "Packing list" and the note of "Book ferry" are listed, and "Trip" itself is not

#### Scenario: Orphans
- **WHEN** the note "Trip" is linked from a task, the note "Ideas" links to "Trip" but nothing links to "Ideas", and the user types `orphan `
- **THEN** "Ideas" is listed and "Trip" is not

#### Scenario: Remove a chip
- **WHEN** the field holds the chips "kind: note" and "pinned", the words are empty and the user presses Backspace
- **THEN** the "pinned" chip is removed and the list keeps every standalone note

#### Scenario: Enter still opens
- **WHEN** the user types `pin`, which starts the key `pinned`, and presses Enter
- **THEN** the first note matching the word "pin" opens and no chip is added

#### Scenario: Filters of an earlier version
- **WHEN** a device that stored the Source "Standalone only" and the project "Renovation" opens Notes for the first time after the update
- **THEN** the field holds the chips "kind: note" and "in: Renovation", and the list is the one those filters showed

#### Scenario: Renamed project
- **WHEN** the field holds the chip "in: Renovation" and the project is renamed "House works" on another device
- **THEN** after sync the chip reads "in: House works" and keeps the same notes

#### Scenario: Encrypted and offline
- **WHEN** an encrypted account is unlocked on an offline device and the user types `@errand ferry`
- **THEN** the notes with that label whose decrypted text contains "ferry" are listed and no request is made

## REMOVED Requirements

### Requirement: Filtering notes
**Reason**: The Source, Project and Label pickers are replaced by search tokens (`kind:`, `orphan`, `in:`, `@`), which do the same in the one search field and need no Filters sheet on a phone.
**Migration**: See "Search tokens": a device's stored filters become chips on its first visit after the update (Task notes → `kind:task`, Project notes → `kind:project`, Standalone only → `kind:note`, Unlinked → `orphan`, the project → `in:`, the label → `@`), and the chips are remembered on the device as the filters were.
