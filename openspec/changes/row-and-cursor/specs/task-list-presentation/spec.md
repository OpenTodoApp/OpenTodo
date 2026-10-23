## MODIFIED Requirements

### Requirement: Inline title editing
On a fine pointer from 768 px wide, with the panel closed and the device preference "Click a task to" set to "Edit in place" (the default), clicking a task's title in a list SHALL select the row and turn its title into a text field in place, with the caret where the user clicked. `F2` on a selected row SHALL do the same with the caret at the end. Enter or a click outside the row SHALL save the title, Esc SHALL discard the title change and leave the row selected, and `Shift+Enter` SHALL save and open the task panel. Only one row SHALL be edited inline at a time, and that row SHALL not start a drag, so pressing and moving in its field selects text; the other rows stay draggable. Edits SHALL apply locally at once, work offline and converge per field like any title edit. Viewers SHALL never get the inline editor. With the preference set to "Open details", on a coarse pointer, below 768 px, or while the panel is open, a click SHALL open the task in the panel as before. A click on a row's or a board card's empty area (anything that is not the title, the checkbox, the chevron, the selection box, a link or a revealed action: the padding, the gaps, the leading slot, the trailing space) SHALL select the task and open it in the panel under either preference and on any pointer, Shift or Ctrl/⌘ on it SHALL tick the row as on the title, and a drag or a swipe that ends on it SHALL not open anything. The row's controls keep their own actions and the keyboard behaviour is unchanged.

#### Scenario: Fix a typo in place
- **WHEN** the panel is closed and the user clicks inside the title "Renew pasport" between "pas" and "port", types `s` and presses Enter
- **THEN** the title is "Renew passport", no panel opened, and the row stays selected

#### Scenario: Cancel
- **WHEN** the user is editing a title inline and presses Esc
- **THEN** the title is unchanged, the editor closes and the row is still selected

#### Scenario: Keyboard start
- **WHEN** a row is selected with `j` and the user presses `F2`
- **THEN** the row's title becomes editable with the caret at the end

#### Scenario: Open the details from the editor
- **WHEN** the user is editing inline and presses `Shift+Enter`
- **THEN** the title is saved and the task panel opens on that task

#### Scenario: Panel open means switch
- **WHEN** the panel shows one task and the user clicks another task's title
- **THEN** the panel shows the clicked task and no inline editor opens

#### Scenario: Phone
- **WHEN** the user taps a task's title on a 390 px wide touch screen
- **THEN** the task opens in the panel sheet as before

#### Scenario: Preference to open details
- **WHEN** the user sets "Click a task to" to "Open details" on this device and clicks a title
- **THEN** the panel opens, and on another device the default is still "Edit in place"

#### Scenario: Selecting text does not drag
- **WHEN** the user is editing a title inline in a manually ordered list and drags across the words in its field
- **THEN** the words are selected, the row does not move, and every other row can still be dragged

#### Scenario: Empty area opens the panel
- **WHEN** "Click a task to" is "Edit in place", the panel is closed, and the user clicks a row in the space between its title and its project name
- **THEN** the row is selected and the task opens in the panel, and no inline editor opens

#### Scenario: Empty area with "Open details"
- **WHEN** "Click a task to" is "Open details" and the user clicks a row's left padding
- **THEN** the task opens in the panel

#### Scenario: Controls keep their actions
- **WHEN** the user clicks a row's checkbox, its chevron or its revealed More action
- **THEN** the task completes, its subtasks fold, or the row menu opens, and the panel does not open

#### Scenario: A drag does not open
- **WHEN** the user presses a row's empty area, drags it to another place in a manually ordered list and releases
- **THEN** the task moves and the panel does not open

### Requirement: Empty views
A view with nothing to list SHALL show one empty view, centred in the content column: one sentence, at most one primary action, and at most one secondary text link; no icon, no second sentence, no second button, no printed key hint. The action's key, when it has one, SHALL be in its tooltip on fine-pointer devices only. A list that shows its own quick-add field above the empty view SHALL offer no "Add a task" button: the field is the way to add, and `q` still focuses it (or opens the quick-add sheet on a touch device). Each view's copy is a scenario below. The empty view SHALL be one region with the sentence as its heading, reads local data (so it is the same offline) and writes nothing.

#### Scenario: Inbox
- **WHEN** the Inbox has no open task
- **THEN** it reads "Inbox zero: every task has a place." with no button and no link, under the Inbox's quick add

#### Scenario: Empty Today on a phone
- **WHEN** Today has no tasks on a touch device
- **THEN** it reads "Nothing due today." with an "Open Upcoming" link, no button and no key hint, and the quick add above it stays the way to add

#### Scenario: Empty Today on a desktop
- **WHEN** Today has no tasks on a desktop with a mouse
- **THEN** the same sentence and link are shown, no button and no hint, and `q` focuses the quick add

#### Scenario: Everything waits
- **WHEN** Today has three tasks that are all blocked by other tasks
- **THEN** it reads "Nothing is ready to start today." with the link "3 waiting for other tasks", which opens Waiting, and no button

#### Scenario: Upcoming, Anytime, Someday
- **WHEN** Upcoming, Anytime or Someday has no task
- **THEN** it reads "Nothing scheduled yet.", "Nothing waiting for a free moment." or "Nothing parked for later." with no button and no link

#### Scenario: Assigned to me
- **WHEN** nothing is assigned to the user
- **THEN** it reads "Nothing is assigned to you." with "Open Inbox"

#### Scenario: Next and Waiting
- **WHEN** no project has a next action, or nothing is waiting
- **THEN** Next reads "Add a next step to a project." with "Walk your projects", and Waiting reads "Nothing is waiting on anyone." with "Open Next"

#### Scenario: Project
- **WHEN** a project in the list layout has no open task
- **THEN** it reads "This project has no open tasks." with no button, or with "Open Inbox" when the project is read-only for the user (it has no quick add)

#### Scenario: Project with completed tasks only
- **WHEN** a project's tasks are all completed and its Completed group is off
- **THEN** the empty view offers the link "Show 4 completed", which turns the Completed group on

#### Scenario: Label
- **WHEN** no open task carries the label
- **THEN** it reads "No open task carries this label." with no button; the label's quick add above applies the label

#### Scenario: Filters
- **WHEN** a filter query, a saved filter or the duration filter matches no task
- **THEN** it reads "No task matches this filter." with "Clear the filter", "No task matches this view." with "Edit the view", or "No task matches this duration filter." with "Clear the filter"

#### Scenario: Completed has no quick add
- **WHEN** Completed is empty
- **THEN** it reads "Nothing completed yet." with "Open Today" and no "Add a task"

#### Scenario: Trash
- **WHEN** the Trash is empty
- **THEN** it reads "The Trash is empty." with one "Open Inbox" button and nothing else

#### Scenario: Calendar day
- **WHEN** a day of the Day view, the week's agenda or the month's day list has nothing planned
- **THEN** it reads "Nothing planned." with "Add a task", which opens quick add with that day as the date

#### Scenario: Inbox triage
- **WHEN** triage runs out of Inbox tasks
- **THEN** it reads "Inbox zero: every task has a place." with "Back to the Inbox"

#### Scenario: Gone target is not an empty view
- **WHEN** a project or label route names one that no longer exists
- **THEN** the page keeps its own note with the way back, not an empty view

#### Scenario: A task arrives
- **WHEN** the Inbox shows its empty view and another device captures a task, which syncs
- **THEN** the empty view is replaced by the task's row without a reload

#### Scenario: Place
- **WHEN** no open task happens at a saved location
- **THEN** its page reads "No open task happens at this location." with no button
