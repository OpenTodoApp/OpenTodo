## MODIFIED Requirements

### Requirement: Names for the four priority levels
Each user SHALL be able to name each of the four priority levels. A name SHALL be one line of at most 24 characters after trimming; an empty name SHALL mean the default, "Priority 1" to "Priority 3" in the interface language, and for level 4, the level every task starts at, no priority: "No priority" as a word and "None" where a level is a short choice, such as the priority picker. Where a task with no priority shows its priority as a property, the task panel SHALL show the empty affordance it uses for an unset property, and rows SHALL show no priority mark. A name the user gives level 4 SHALL be shown instead, like any level's name. Two levels MAY share a name. The stored priority of a task SHALL remain the number 1 to 4; naming a level SHALL NOT change any task.

#### Scenario: Rename two levels
- **WHEN** the user names level 1 "Must" and level 2 "Should" and leaves 3 and 4 empty
- **THEN** a priority-1 task's facts read "Must", a priority-3 task's read "Priority 3", a priority-4 task shows no priority, and no task's stored priority changes

#### Scenario: Default follows the language
- **WHEN** a user who never named a level switches the interface to German
- **THEN** the levels read "Priorität 1" to "Priorität 3" and "Keine Priorität"

#### Scenario: Too long
- **WHEN** the user types a 30-character name
- **THEN** the field stops at 24 characters and says so

#### Scenario: Reset
- **WHEN** the user chooses Reset on the Priorities card
- **THEN** the four names are empty and the defaults are shown everywhere

#### Scenario: A new task has no priority
- **WHEN** a user who never named level 4 adds a task without a priority token and opens it
- **THEN** the task is stored with priority 4, the panel shows the faint unset Priority part, and the priority picker offers P1, P2, P3 and None, with None selected

#### Scenario: Take a priority away
- **WHEN** the user sets P1 on a task and then chooses None in the priority picker
- **THEN** the task's priority is 4 again and the panel shows the unset Priority part

#### Scenario: A named level 4
- **WHEN** the user names level 4 "Whenever" and opens a task at level 4
- **THEN** the panel shows "Whenever" as the task's priority and the picker offers it in place of None

### Requirement: Names shown wherever a level is shown
Wherever the app shows a priority level to a person, it SHALL show the level's name with its colour: the task's facts, the priority picker and the row menu's Priority submenu, quick-add and title-editing chips, list group headings and board columns grouped by priority, filter builder chips, bulk actions, command palette commands, the assistant's proposed change sets, the activity and history entries and the shortcut overlay. The accessible name SHALL include the level number after the name. The sort order of levels SHALL stay 1 to 4.

#### Scenario: Grouped list
- **WHEN** levels 1 and 2 are named "Must" and "Should" and the user groups a project by priority
- **THEN** the group headings read "Must", "Should", "Priority 3", "No priority" in that order

#### Scenario: Filter builder chip
- **WHEN** a saved view's query is `p1 | p2` and level 1 is named "Must"
- **THEN** the builder shows the chips "Priority is Must" and "Priority is P2" (an unnamed level keeps today's text), and the stored query stays `p1 | p2`

#### Scenario: Screen reader
- **WHEN** a screen reader user moves to the priority fact of a task at level 1 named "Must"
- **THEN** it is announced as "Must, priority 1"

#### Scenario: Phone width
- **WHEN** a 24-character name is shown in a chip and in the row menu at 360 px
- **THEN** it fits on one line or is truncated with an ellipsis, and the full name is in the tooltip and the accessible name

#### Scenario: No priority in a filter and a bulk action
- **WHEN** an unnamed level 4 is chosen in the filter builder and as a bulk action on three tasks
- **THEN** the builder's chip reads "No priority", the bulk menu offers "No priority", and the undo toast reads "Priority removed from 3 tasks"

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
- **THEN** the suggestions list "p1 · Must", "p2 · Priority 2", "p3 · Priority 3", "p4 · No priority"

#### Scenario: Rename keeps saved views
- **WHEN** the user renames level 2 after saving the view `p2 & today`
- **THEN** the view lists the same tasks as before

#### Scenario: Agent sees numbers
- **WHEN** an MCP client reads a task at level 1 named "Must"
- **THEN** the result carries priority 1 and no name

#### Scenario: Command-line table
- **WHEN** `ot today` lists a task at level 1 and one at level 4
- **THEN** the first row's priority column reads "P1" and the second's is empty, while `--json` carries the numbers 1 and 4
