## MODIFIED Requirements

### Requirement: Notes page
The app SHALL have a Notes page at `/notes`, loaded on first use, that lists standalone notes (not deleted) and project notes (projects not deleted with a non-empty note, archived ones marked) of the current workspace, and task notes (tasks not deleted with a non-empty note, completed ones marked) only while the search field holds a `kind:task` chip, so a task's description, which is the task's details, never crowds out the notes the user wrote unless asked for; searching words SHALL look among the same notes, from local data only, sorted by the time the note itself last changed, newest first. With no words and no token in the search field, pinned standalone notes SHALL be listed first under a **Pinned** heading in the user's favourites order, and every other note under a **Recent** heading in that sorted order; without pinned notes the list SHALL have no headings. It SHALL show the first 50 of the sorted notes and a Show more control that adds the next 50, with the number shown and the total beside it. Each row SHALL be one line on a row grid shared by every row: the kind icon, the title, where the note lives (the standalone note's project, the task's project or Inbox, the project of a project note), its labels as at most two chips then "+n" in the style of task rows, and the relative time of the last change, right-aligned. Opening a row SHALL open the task with its note, the project with its note open for editing, or the standalone note. The page SHALL work offline and SHALL send nothing to the server. An empty page SHALL show one sentence and the New note action. The header SHALL hold the title, the note count, New note and Help, and SHALL keep a place among its actions for a view switch of the Notes page.

#### Scenario: Default list
- **WHEN** the user has 312 standalone and project notes and 900 tasks with a description, none pinned, and opens Notes
- **THEN** the 50 most recently changed standalone and project notes are listed, newest first, without headings, with "50 of 312" and Show more, and no task is listed

#### Scenario: Pinned first
- **WHEN** the user has pinned the notes "Wi-Fi" and "Packing list" and opens Notes
- **THEN** both are listed under Pinned in the pinned order, and the other notes follow under Recent, newest first, without repeating the pinned ones

#### Scenario: Search shows one list
- **WHEN** the user with pinned notes types `ferry` in the search field
- **THEN** the results are one ranked list without the Pinned and Recent headings

#### Scenario: One line per note
- **WHEN** the field holds the chip "kind: task" and a task note of "Call the plumber" in the project "Home" with the labels "errand" and "phone", changed two hours ago, is listed on a 1280 px screen
- **THEN** its row is one line with the task icon, "Call the plumber", "Home", the chips "errand" and "phone", and "2 h ago" at the row's end, aligned with the same columns of the rows above and below

#### Scenario: Where a note lives
- **WHEN** the field holds the chips "kind: note", "kind: task" and "kind: project", and the list holds a standalone note in "Renovation", a task note of a task without a project and a project note of "Garden"
- **THEN** their rows read "Renovation", "Inbox" and "Garden" in the place column

#### Scenario: A task's other change does not count
- **WHEN** the field holds the chip "kind: task" and the user changes the due date of a task whose note was last edited a month ago
- **THEN** the task's note keeps its place in the list

#### Scenario: Offline
- **WHEN** the device is offline and the user opens Notes
- **THEN** the list is shown from local data with no request and no error

#### Scenario: Open a project note
- **WHEN** the user opens a project note from the list
- **THEN** the project opens with its note in edit mode

#### Scenario: Task descriptions one chip away
- **WHEN** the user picks `kind:task` in the search field and reopens Notes the next day on the same device
- **THEN** both times the list shows task notes, completed ones marked, because the chip is remembered on the device

#### Scenario: A word in a task description
- **WHEN** a task "Charge headphones" has the description "the battery is at 37%" and the user types `battery` with no chip
- **THEN** the task is not listed; with the chip "kind: task" it is
