## MODIFIED Requirements

### Requirement: Inbox list and detail
From 1024 px of screen width the Inbox SHALL keep a detail pane beside its list, in the shell's panel slot, about half the content's width (at least 26 rem, at most 44 rem) unless the user resized it (`app-shell` "Panel width and expansion"). The task under the list's cursor SHALL show in the pane, as the docked task of `web-app` "Task page" shows it, and SHALL follow the cursor: `j`, `k`, the arrow keys and a click on a row move the cursor and the pane shows that task. A click on a task's title SHALL show it in the pane instead of editing it in place. Enter on the cursor's row SHALL open the task as its page (`web-app` "Task page"), whose Back returns to the Inbox. Escape, the pane's Close and a click on the empty part of the list SHALL clear the cursor and empty the pane. While rows are ticked for a bulk action the pane SHALL stay empty, since ticking opens nothing; when the ticks clear, the cursor's task SHALL show again. With no task under the cursor the pane SHALL read "No task selected" with one sentence naming the ways on: select a task, or press `P` to process them, one at a time. An Inbox with no task SHALL show its empty state and no pane. Below 1024 px the Inbox SHALL be a plain list whose tasks open as their page. The pane SHALL only read and edit the task through the same operations as the task page, so it works offline and converges like any edit.

For a user who chose the side panel (`appearance-preferences` "Task opening preference"), the Inbox SHALL instead keep the side panel of `web-app` "Task details in a side panel", like every other list. The panel opens and closes by those rules, never empties itself on Escape or a click on the list, and keeps the task shown while rows are ticked. The Inbox's "No task selected" sentence, with `P`, SHALL stay the Inbox's empty pane.

#### Scenario: The pane follows the cursor
- **WHEN** the Inbox holds "Book the dentist" and "Ideas for Mia's birthday" on a 1440 px screen and the user presses `j`, then `j` again
- **THEN** the pane shows "Book the dentist", then "Ideas for Mia's birthday", and focus stays on the list

#### Scenario: No task selected
- **WHEN** the user opens the Inbox with four tasks and nothing selected
- **THEN** the pane reads "No task selected" and "Select a task to decide where it goes, or press P to process all 4, one at a time."

#### Scenario: Enter opens the page
- **WHEN** the pane shows "Book the dentist" and the user presses Enter
- **THEN** the task opens at `/task/<id>` with "2 / 4", and Escape returns to the Inbox with that row selected

#### Scenario: Escape empties the pane
- **WHEN** the pane shows a task and the user presses Escape on the list
- **THEN** no row is selected and the pane reads "No task selected"

#### Scenario: Ticking opens nothing
- **WHEN** the pane shows a task and the user ticks it and the next row with `x` and Shift+Down
- **THEN** the pane reads "No task selected" while the two rows are ticked, and shows the cursor's task again after Escape clears the ticks

#### Scenario: Narrow screen
- **WHEN** the user presses Enter on a selected Inbox task in a 900 px wide window
- **THEN** the task opens as its page, and no pane is shown beside the Inbox

#### Scenario: Side panel in the Inbox
- **WHEN** a user who chose the side panel selects "Book the dentist" in the Inbox on a 1440 px screen and presses Escape on the list
- **THEN** the panel showed "Book the dentist" and still shows it after Escape, with no row selected

#### Scenario: Side panel closed in the Inbox
- **WHEN** that user closes the panel with its Close button and opens the Inbox again
- **THEN** no pane is shown beside the Inbox until the user clicks a task or presses Enter on one
