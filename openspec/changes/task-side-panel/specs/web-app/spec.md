## MODIFIED Requirements

### Requirement: Task detail panel
Opening a task SHALL show it as its own page at `/task/<id>` (see "Task page") for editing title, notes, project, priority, dates and every other task property, with complete, delete and close actions. The page SHALL show every property in its facts column, a property without a value as a quiet action that sets it (see "Task facts column"). A task SHALL open from Enter on a selected row, from Open details or `Shift+Enter` in the inline editor, and from a click on a row's title when the inline editor does not apply (see `task-list-presentation` "Inline title editing"). Only a page that keeps a split SHALL show the task in the shell's panel slot beside its content instead, and only from 1024 px; below that it opens the page too. The pages that keep a split are Process the Inbox, the Inbox itself (see `inbox-triage` "Inbox list and detail"), and, for a user who chose the side panel (`appearance-preferences` "Task opening preference"), the lists of "Task details in a side panel". On the Inbox the task under the cursor shows beside the list, a click on a title shows it there instead of editing it in place, and Enter opens its page. Where another capability says the task panel or the detail panel, it means the task page, or the docked panel on a page that keeps a split.

#### Scenario: Open from the list
- **WHEN** the user presses Enter on a selected task, or taps a task's title on a touch screen
- **THEN** the task opens as its page, the address is `/task/<id>`, and nothing is docked beside the list

#### Scenario: Click edits in place on a desktop
- **WHEN** the user clicks a task's title in Today with a mouse on a 1280 px wide screen
- **THEN** the title becomes editable in the list and the task page does not open

#### Scenario: Empty task shows few things
- **WHEN** the user opens a task with a title, a project and nothing else
- **THEN** the facts column shows the priority and the project as values, every other fact as a quiet action such as "Set a deadline", and no empty form field

#### Scenario: Open on a phone
- **WHEN** the user opens a task from Today on a 390×844 phone
- **THEN** the task page fills the screen with Back to Today in the bar, the facts under the notes, and no tab bar or add button

#### Scenario: Drag the handle to close
- **WHEN** the user opens a task on a 390 px phone
- **THEN** it opens as its page with no handle and no scrim, and Back in the bar returns to the list where it was

#### Scenario: Reading comments does not close the sheet
- **WHEN** the user scrolls the task page down to the comments and drags down on a comment
- **THEN** the page scrolls and nothing closes

#### Scenario: Scrim and Close
- **WHEN** the user chooses Close on the task page, or Back on a phone
- **THEN** the list it was opened from shows with the task's row selected

#### Scenario: Triage keeps its split
- **WHEN** the user presses Enter on the card in Process the Inbox on a 1280 px wide screen
- **THEN** the task opens in the panel beside the card, and Escape closes it and returns to the card

#### Scenario: The Inbox keeps its split
- **WHEN** the user selects a task in the Inbox on a 1280 px wide screen, then presses Enter
- **THEN** the task shows in the panel beside the list, then opens as its page at `/task/<id>`

#### Scenario: Side panel chosen
- **WHEN** a user who chose the side panel presses Enter on a selected task in Today on a 1280 px wide screen
- **THEN** the task shows in the panel beside Today and no page opens

## ADDED Requirements

### Requirement: Task details in a side panel
For a user who chose the side panel (`appearance-preferences` "Task opening preference"), the following lists SHALL keep a side panel in the shell's panel slot from 1024 px of screen width: Inbox, Today, Upcoming, Anytime, Someday, Completed, Assigned to me, Next, Waiting, projects (list, board and timeline), labels, places, the Filter view and saved views. The panel SHALL show the docked task as "Task panel layout" describes it: the checkbox, the title, the menu with Expand, Close, the notes, the facets, the custom fields, the subtasks, the attachments and the Comments, Activity, History and Time tabs.

The panel SHALL be either open or closed. Its state SHALL be kept on the device across lists and reloads, and it SHALL be open the first time.

While the panel is open:
- A click on a task's row or title, Enter on a selected row whose task is not shown, and moving the cursor (`j`, `k`, the arrow keys, a click) SHALL show that task in the panel. While rows are ticked for a bulk action the panel SHALL keep its task.
- A click on a title SHALL show the task rather than edit the title in place; `F2` still edits it in place.
- Enter on the row whose task is shown SHALL open the task page.
- With no task shown the panel SHALL read "No task selected" and "Select a task to see its details here." (the Inbox keeps its own sentence, `inbox-triage` "Inbox list and detail"), with the same Close and resize handle. A list with no rows SHALL show no empty pane.

The panel SHALL never close by itself. Escape on the list and a click on the empty part of the list clear the cursor and leave the panel as it is. Completing the shown task and ticking rows leave it too. Going to another list leaves the panel open, showing "No task selected" until a task is chosen there. A task that is deleted leaves the empty pane in its place. Only the panel's Close button, or Escape while focus is inside the panel, SHALL close it.

While the panel is closed:
- Moving the cursor SHALL show nothing.
- A click on a task's row or title, Enter on a selected row, Open details, a task chosen in the command palette, and a link to a task in a note SHALL open the panel again with that task.

Below 1024 px, and on the screens not listed (the calendar's Day, Week, Month and Plan, dashboards, the review screens, Close the day), a task SHALL open as its page whatever the preference. Expanding a row's details in place (`task-list-presentation` "Expanded rows") SHALL work as it does without the panel, and the rows SHALL lay out by their own width as the panel narrows the list. The panel SHALL read and edit the task through the same operations as the task page, so it works offline and converges like any edit.

#### Scenario: Click shows the task beside a project
- **WHEN** a user with the side panel opens a project on a 1440 px wide screen and clicks the title of "Order the tiles"
- **THEN** "Order the tiles" shows in the panel beside the list with its notes, subtasks and Comments tab, the title is not edited in place, and no page opens

#### Scenario: The panel follows the keyboard
- **WHEN** the panel shows a task in a label's list and the user presses `j` twice
- **THEN** the panel shows the task two rows down, and focus stays on the list

#### Scenario: Never closes by itself
- **WHEN** the panel shows a task in Upcoming and the user presses Escape on the list, clicks the empty space under the last row, then completes the shown task with its checkbox
- **THEN** no row is selected and the panel still shows the task, now completed

#### Scenario: Closed stays closed
- **WHEN** the user closes the panel with its Close button, moves the cursor with `j` and `k`, and reloads the page
- **THEN** no panel opens at any point

#### Scenario: Reopen with a click or Enter
- **WHEN** the panel is closed and the user selects a task with `j` and presses Enter
- **THEN** the panel opens with that task, and a second Enter opens the task's page at `/task/<id>`

#### Scenario: Escape inside the panel
- **WHEN** focus is in the panel's Comments tab and the user presses Escape outside a text field
- **THEN** the panel closes, focus returns to the list, and moving the cursor opens nothing

#### Scenario: Another list
- **WHEN** the panel shows a task in Today and the user goes to the Filter view
- **THEN** the panel stays open beside the results and reads "No task selected" until the user selects a result

#### Scenario: Offline edit in the panel
- **WHEN** the device is offline and the user changes the shown task's notes in the panel
- **THEN** the change applies at once, and reaches the other devices on the next sync like an edit on the task page

#### Scenario: Narrow window
- **WHEN** a user with the side panel presses Enter on a selected task in a 900 px wide window
- **THEN** the task opens as its page and no panel is shown

#### Scenario: Calendar keeps its planning list
- **WHEN** a user with the side panel double-clicks a task in Month
- **THEN** the task opens as its page as before

#### Scenario: A row still expands in place
- **WHEN** the panel shows a task and the user presses → on another selected row of the same list
- **THEN** that row's details open under it in the list, and the panel shows the selected row's task
