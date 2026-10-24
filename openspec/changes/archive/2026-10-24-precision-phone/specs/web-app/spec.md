## MODIFIED Requirements

### Requirement: Task facts column
The task page SHALL show the task's properties in a facts column of labelled rows under the headings Schedule (Do, Start, Deadline, Reminder, Repeat), Details (Priority, Estimate, Assignee when the account can assign, Blocked by, Blocks when something waits for the task, Location), Labels and Project (project, section when the project has sections or the task has one, parent task, origin when it has one). A row with a value SHALL read in the list row's words; a row without one SHALL read as the action that sets it ("Set a deadline", "Add a place", "Doesn’t repeat") in a quiet tone. Activating a row SHALL open the same editor the facet part opens (see "Facet editors are popovers"), anchored to the row, and write the same operation. The list keys that open an editor (`d`, `Shift+N`, `b`, `e`) SHALL open the task page with that row's editor open. For a viewer every row SHALL be text and rows without a value SHALL be hidden. Below 768 px the facts SHALL be one card of rows at least 44 px tall, without the group headings: each row the fact's icon and name on the left and its value or action at the right. The card SHALL first show the facts with a value, Do and Deadline whether set or not, and Priority only when it is above 4, with labels as one row when the task has any; a "More properties" row SHALL show every other fact in place, and an editor opened for a fact that is not shown yet (from a list key) SHALL show them all.

#### Scenario: Stacked facts on a phone
- **WHEN** a task due today with a 15:00 reminder, assigned to Mia Lang in "Home renovation" and without a deadline, is opened on a 390×844 phone
- **THEN** the facts are one card of 44 px rows reading Do · Today, Deadline · Set a deadline, Reminder · 15:00, Assignee · Mia Lang and Project · Home renovation, followed by "More properties", and no group heading is shown

#### Scenario: More properties
- **WHEN** the user taps "More properties" on that card
- **THEN** Start, Repeat, Priority 4, Estimate, Blocked by, Location, Parent task and Labels are added in place, the unset ones as actions, and "More properties" is gone

#### Scenario: Set a deadline from its row
- **WHEN** the user activates "Set a deadline" on a task's page
- **THEN** the When editor opens on its Deadline segment anchored to the row, and a picked date reads in the row afterwards

#### Scenario: Deadline from the list
- **WHEN** a task is selected in Today and the user presses `d`
- **THEN** the task's page opens with the When editor on its Deadline segment and the date field focused

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens one of its tasks
- **THEN** the facts read as text, no row opens an editor, and no unset fact is listed
