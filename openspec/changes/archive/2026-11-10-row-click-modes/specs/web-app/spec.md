## MODIFIED Requirements

### Requirement: Task details in a side panel
For a user who chose the side panel (`appearance-preferences` "Task opening preference"), the following lists SHALL keep a side panel in the shell's panel slot from 1024 px of screen width: Inbox, Today, Upcoming, Anytime, Someday, Completed, Assigned to me, Next, Waiting, projects (list, board and timeline), labels, places, the Filter view and saved views. The panel SHALL show the docked task as "Task panel layout" describes it: the checkbox, the title, the menu with Expand, Close, the notes, the facets, the custom fields, the subtasks, the attachments and the Comments, Activity, History and Time tabs.

The panel SHALL be either open or closed. Its state SHALL be kept on the device across lists and reloads, and it SHALL be open the first time.

While the panel is open:
- A click on a task's row or title, Enter on a selected row whose task is not shown, and moving the cursor (`j`, `k`, the arrow keys, a click) SHALL show that task in the panel. While rows are ticked for a bulk action the panel SHALL keep its task.
- A click on a title SHALL show the task rather than edit the title in place; `F2` still edits it in place. With "Click a task to" set to "Expand the row" (`task-list-presentation` "\"Click a task to\" and double-click") a click SHALL instead select the row and show or hide its details, and the panel SHALL show the selected task as for any cursor move.
- Focus SHALL stay on the list when the panel follows the cursor, after a key and after a click on a row alike; the panel takes focus only when the user moves into it.
- Following the cursor SHALL cost the list what moving the cursor costs without the panel: one render of the list and of the two rows whose selection changed per move, at any list size.
- Enter on the row whose task is shown SHALL open the task page.
- With no task shown the panel SHALL read "No task selected" and "Select a task to see its details here." (the Inbox keeps its own sentence, `inbox-triage` "Inbox list and detail"), with the same Close and resize handle. A list with no rows SHALL show no empty pane.

The panel SHALL never close by itself. Escape on the list and a click on the empty part of the list clear the cursor and leave the panel as it is. Completing the shown task and ticking rows leave it too. Going to another list leaves the panel open, showing "No task selected" until a task is chosen there. A task that is deleted leaves the empty pane in its place. Only the panel's Close button, or Escape while focus is inside the panel, SHALL close it.

While the panel is closed:
- Moving the cursor SHALL show nothing.
- A click on a task's row or title (under "Expand the row" a click only expands the row and the panel stays closed), Enter on a selected row, Open details, a task chosen in the command palette, and a link to a task in a note SHALL open the panel again with that task.

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

#### Scenario: Expand the row beside the panel
- **WHEN** "Click a task to" is "Expand the row", the panel is open in Today and the user clicks the title of "Order the tiles"
- **THEN** the row's details show under it, the panel shows "Order the tiles", and focus stays on its row

#### Scenario: Expand the row with the panel closed
- **WHEN** "Click a task to" is "Expand the row", the panel is closed and the user clicks a row
- **THEN** the row's details show under it and the panel stays closed until Enter

#### Scenario: Following a large list
- **WHEN** the panel is open beside a project of 2,000 tasks and the user presses `j` three times
- **THEN** each press shows the next task in the panel, draws the list once and re-renders two rows
