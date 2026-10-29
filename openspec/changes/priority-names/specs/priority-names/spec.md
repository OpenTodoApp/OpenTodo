## ADDED Requirements

### Requirement: Names for the four priority levels
Each user SHALL be able to name each of the four priority levels. A name SHALL be one line of at most 24 characters after trimming; an empty name SHALL mean the default, "Priority 1" to "Priority 4" in the interface language. Two levels MAY share a name. The stored priority of a task SHALL remain the number 1 to 4; naming a level SHALL NOT change any task.

#### Scenario: Rename two levels
- **WHEN** the user names level 1 "Must" and level 2 "Should" and leaves 3 and 4 empty
- **THEN** a priority-1 task's facts read "Must", a priority-3 task's read "Priority 3", and no task's stored priority changes

#### Scenario: Default follows the language
- **WHEN** a user who never named a level switches the interface to German
- **THEN** the levels read "Priorität 1" to "Priorität 4"

#### Scenario: Too long
- **WHEN** the user types a 30-character name
- **THEN** the field stops at 24 characters and says so

#### Scenario: Reset
- **WHEN** the user chooses Reset on the Priorities card
- **THEN** the four names are empty and the defaults are shown everywhere

### Requirement: Priority names are personal, synced and offline
The names SHALL be written as operations on the user's personal preferences, one field per level, so they apply on every device of that user and never on another user's. They SHALL be editable offline and take effect at once on the editing device, SHALL converge by last-writer-wins per level, and SHALL be part of the JSON export. A client that does not know the fields SHALL keep showing the defaults.

#### Scenario: Change on one device
- **WHEN** the user names level 1 "Fire" on the laptop and the phone later syncs
- **THEN** the phone shows "Fire" without a reload

#### Scenario: Offline edit
- **WHEN** the installed app is offline and the user names level 4 "Whenever"
- **THEN** it is shown at once and reaches the other devices on the next sync

#### Scenario: Concurrent edits to different levels
- **WHEN** device A names level 1 "Must" and device B names level 3 "Could", both offline, and both sync
- **THEN** every device shows "Must" for level 1 and "Could" for level 3

#### Scenario: Concurrent edits to the same level
- **WHEN** device A names level 1 "Must" and device B names it "Now", both offline, and both sync
- **THEN** every device ends with the name written with the greater timestamp

#### Scenario: Shared project
- **WHEN** Ana names level 1 "Must", Ben never renamed, and both open a shared project's priority-1 task
- **THEN** Ana sees "Must" and Ben sees "Priority 1"

#### Scenario: Export and import
- **WHEN** the user downloads the JSON export and imports it into a new account
- **THEN** the four names are restored

### Requirement: Names shown wherever a level is shown
Wherever the app shows a priority level to a person, it SHALL show the level's name with its colour: the task's facts, the priority picker and the row menu's Priority submenu, quick-add and title-editing chips, list group headings and board columns grouped by priority, filter builder chips, bulk actions, command palette commands, the assistant's proposed change sets, the activity and history entries and the shortcut overlay. The accessible name SHALL include the level number after the name. The sort order of levels SHALL stay 1 to 4.

#### Scenario: Grouped list
- **WHEN** levels 1 and 2 are named "Must" and "Should" and the user groups a project by priority
- **THEN** the group headings read "Must", "Should", "Priority 3", "Priority 4" in that order

#### Scenario: Filter builder chip
- **WHEN** a saved view's query is `p1 | p2` and level 1 is named "Must"
- **THEN** the builder shows the chips "Priority is Must" and "Priority is Priority 2", and the stored query stays `p1 | p2`

#### Scenario: Screen reader
- **WHEN** a screen reader user moves to the priority fact of a task at level 1 named "Must"
- **THEN** it is announced as "Must, priority 1"

#### Scenario: Phone width
- **WHEN** a 24-character name is shown in a chip and in the row menu at 360 px
- **THEN** it fits on one line or is truncated with an ellipsis, and the full name is in the tooltip and the accessible name

### Requirement: Numeric tokens stay the syntax
Quick add and filter queries SHALL keep recognising `p1` to `p4` regardless of the names, and SHALL NOT recognise a name as a priority. Saved views, automation rules, the REST API, the command-line client, MCP tools, CalDAV and the Markdown vault SHALL keep priorities as numbers. Server-written text (emails, the weekly digest, notification channels) SHALL keep the default wording. Typing `p` in quick add SHALL suggest the four levels with their names.

#### Scenario: Quick add with a renamed level
- **WHEN** level 1 is named "Must" and the user enters `Pay rent p1`
- **THEN** the task has priority 1, the title is `Pay rent` and the chip reads "Must"

#### Scenario: Name is not a token
- **WHEN** level 1 is named "Must" and the user enters `Must call Ana`
- **THEN** the title is `Must call Ana` and the priority stays the default

#### Scenario: Suggestions
- **WHEN** the user types `p` after a space in quick add
- **THEN** the suggestions list "p1 · Must", "p2 · Priority 2", "p3 · Priority 3", "p4 · Priority 4"

#### Scenario: Rename keeps saved views
- **WHEN** the user renames level 2 after saving the view `p2 & today`
- **THEN** the view lists the same tasks as before

#### Scenario: Agent sees numbers
- **WHEN** an MCP client reads a task at level 1 named "Must"
- **THEN** the result carries priority 1 and no name

### Requirement: Priorities card in Settings
Settings → General SHALL have a Priorities card with one text field per level, each beside the level's colour, in order 1 to 4, a Reset action and a Help link. Changes SHALL apply as the user types, without a save button. Settings search SHALL find the card by "priority" and "rename". Every control SHALL be reachable by keyboard, and at 360 px the fields SHALL stack with targets at least 44 px tall.

#### Scenario: Find the card
- **WHEN** the user searches settings for "rename"
- **THEN** "Priorities" is listed under General

#### Scenario: Keyboard only
- **WHEN** a keyboard user tabs through the card
- **THEN** focus moves through the four fields in order and then to Reset, and each field's label names its level
