# Spec Delta

## ADDED Requirements

### Requirement: Token suggestions
In every field that parses (quick add, the task panel's title, the inline title editor), typing `#` at the start of a word SHALL open a list of projects, and typing `@` at the start of a word SHALL open a list of labels, under the field, filtered by the text typed after the symbol and matching any word of the name regardless of case, accents and spaces. Nested projects SHALL show their path. Arrow keys SHALL move through the list, Enter or Tab SHALL pick, Esc SHALL close the list and keep the text, and a pointer SHALL be able to pick. Picking SHALL replace the typed token with one that resolves to exactly that item and SHALL show its chip at once. When no item has exactly the typed name, the list SHALL end with an entry to create a project or a label with that name. A project created this way SHALL be a top-level personal project created through the op log, available offline and converging like any project creation. Inside double quotes no list SHALL open.

#### Scenario: Pick a project with spaces
- **WHEN** a project "Home renovation" exists and the user types `Paint the hall #ren` in quick add and presses Enter on the highlighted "Home renovation"
- **THEN** the line reads `Paint the hall #HomeRenovation `, a project chip reads "Home renovation", and adding the task puts it in that project

#### Scenario: Labels list
- **WHEN** labels "errand" and "deep-work" exist and the user types `@d`
- **THEN** a list shows "deep-work" highlighted and "Create label “d”" last

#### Scenario: Create a project offline
- **WHEN** the device is offline, no project "Garden" exists, and the user types `#Garden` and picks "Create project “Garden”"
- **THEN** a top-level project "Garden" exists at once, the chip reads "Garden", and both the project and the task sync when the device is back online

#### Scenario: Same names under different parents
- **WHEN** projects "Work › Docs" and "Home › Docs" exist and the user picks "Home › Docs"
- **THEN** the token inserted resolves to "Home › Docs" and the chip reads "Home › Docs"

#### Scenario: Esc keeps the text
- **WHEN** the project list is open after `#ho` and the user presses Esc
- **THEN** the list closes, `#ho` stays in the line, and quick add is not closed

### Requirement: Unmatched tokens are explained
When the caret leaves a `#token` that resolves to no project, the preview SHALL show a muted chip that says no project matches, or how many projects match when the token is ambiguous, and that the text stays in the title. Activating that chip SHALL open the project list for the token. An `@token` with no matching label SHALL show its chip as a new label.

#### Scenario: Unknown project
- **WHEN** no project starts with "gardn" and the user types `Rake leaves #gardn ` in quick add
- **THEN** a muted chip reads "No project “gardn” · stays in the title", and the task would be saved with the title `Rake leaves #gardn`

#### Scenario: Ambiguous prefix
- **WHEN** projects "Home" and "Homework" exist and the user types `Fix sink #hom `
- **THEN** a muted chip reads "2 projects match “hom”", and activating it opens the list with both

#### Scenario: New label
- **WHEN** no label "urgent" exists and the user types `@urgent `
- **THEN** the label chip reads "New label “urgent”"

### Requirement: Parsing while editing a title
The task panel's title field and the inline title editor SHALL parse the text the user types during the current edit with the same grammar, chips, dismissal and quoting as quick add. Text that was in the title when the edit began SHALL never be parsed. On commit, every recognised attribute SHALL be applied to the task (due, deadline, start, evening, priority, estimate, recurrence, reminders and project overwrite; labels are added to the task's labels) and its token SHALL be removed from the title, as one undoable change that applies locally at once and converges per field like any edit. Fields of tasks the user cannot edit SHALL not parse.

#### Scenario: Add a date and a priority while editing
- **WHEN** a task is titled "Call the bank" and the user appends ` tomorrow p1` in the panel title and presses Enter
- **THEN** the title is "Call the bank", the task is due tomorrow with priority 1, and the toast offers Undo for the whole change

#### Scenario: Old text is not re-read
- **WHEN** a task titled "Review may report" (saved with the date dismissed) is edited by appending ` draft`
- **THEN** no date chip appears, and the title becomes "Review may report draft" with no due date set

#### Scenario: Labels are added, not replaced
- **WHEN** a task has the label "errand" and the user types ` @deep-work` into its title and commits
- **THEN** the task has both labels, "errand" and "deep-work"

#### Scenario: Move with a project token
- **WHEN** a task in the Inbox is edited inline by typing ` #Work` and committed
- **THEN** the task moves to the project "Work" and the title no longer contains `#Work`

#### Scenario: Offline edit
- **WHEN** the device is offline and the user appends ` friday` to a title and commits
- **THEN** the due date and the new title apply at once and sync when online, converging with other devices' edits per field

#### Scenario: Viewer
- **WHEN** a viewer of a shared project focuses a task title
- **THEN** the title is not editable and nothing is parsed

## MODIFIED Requirements

### Requirement: Per-device parsing toggle
Settings SHALL offer a switch that turns natural-language parsing off for the current device. With parsing off, quick add SHALL behave as a plain title field, the task panel's title and the inline title editor SHALL save the typed text as the title, and none of them SHALL show chips or token suggestions. The setting SHALL be stored only on the device and SHALL not sync.

#### Scenario: Parsing off
- **WHEN** parsing is switched off and the user enters `Buy milk tomorrow p2`
- **THEN** a task titled `Buy milk tomorrow p2` is created with priority 4 and the view's default due date

#### Scenario: Parsing off while editing
- **WHEN** parsing is switched off and the user appends ` tomorrow` to a task's title in the panel
- **THEN** the title ends with "tomorrow" and the due date is unchanged
