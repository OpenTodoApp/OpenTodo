## MODIFIED Requirements

### Requirement: Planning list and phone agenda
The list of tasks to plan SHALL open in the shell's panel slot with a design-system picker for its source, from Day, Week, Month and Plan. Its source SHALL be one of the Inbox, tasks without a date, earlier tasks, a project, a label or a saved list view, chosen with the Combobox (typing narrows the choices), and SHALL be remembered on the device; a source that no longer exists SHALL read as the Inbox. It SHALL list the source's open tasks only (never completed or deleted ones, nor tasks of archived projects), a label's by due date then priority and a view's in the view's own order. It SHALL stay open while the user moves to another day, week or month and switches between Day, Week, Month and Plan, and work with the range on screen. After `s` on a task in the list, Day and Week SHALL take the keys for the placement (arrows move it, Enter places it, Escape cancels it without closing the list) and SHALL then return focus to the list. Only its close button, Escape outside a placement, or opening a page outside the Calendar SHALL close it. Whether it is open SHALL be remembered on the device: closing it with its close button, Escape or the menu item remembers it closed, opening it remembers it open, and from 1024 px Day, Week, Month and Plan SHALL open it again on arrival while it is remembered open and the panel slot is empty; a task opened from the Calendar, or leaving the Calendar, SHALL not change what is remembered. Below 640 px the Week SHALL render as a vertical agenda grouped by day.

#### Scenario: Week on a phone
- **WHEN** the user opens the Week on a 390 px screen
- **THEN** the days are listed vertically with their tasks, and no seven-column grid is rendered

#### Scenario: Planning list in the panel slot
- **WHEN** the user opens the list of tasks to plan from the Calendar
- **THEN** it opens in the shell's panel slot with a picker for its source, and the grid stays in the content column

#### Scenario: The list stays open while the user moves through the Calendar
- **WHEN** the user opens Plan from a list in the Day, presses the next-day chevron, switches to Week and then to Month
- **THEN** the list is still open after each step, and pressing `s` on one of its tasks in the Month puts the task on the focused day

#### Scenario: Leaving the Calendar closes the list
- **WHEN** the planning list is open and the user opens Today
- **THEN** the panel slot is empty

#### Scenario: Place from the list with the keyboard
- **WHEN** the planning list is open in the Week, the user focuses a task in it, presses `s`, presses the down arrow twice and Enter
- **THEN** the task's due becomes that day 30 minutes after the first proposed time as one undoable change, the list stays open, and focus is on the next task in the list

#### Scenario: Escape cancels the placement first
- **WHEN** the user presses `s` on a task in the list and then Escape
- **THEN** the placement ends without a change, the list stays open, and focus is back on that task

#### Scenario: Plan from a label
- **WHEN** the user has labelled three open tasks "week", opens Plan from a list and picks the label "week" by typing "wee"
- **THEN** the list shows those three tasks, and after a reload the list opens on "week" again

#### Scenario: Plan from a saved view
- **WHEN** the user picks the saved view "Urgent" (`p1`) as the source
- **THEN** the list shows the open tasks the view shows, in the view's order, and no completed task even when the view shows completed tasks

#### Scenario: The source is gone
- **WHEN** the remembered source is a label that was deleted on another device
- **THEN** the list shows the Inbox

#### Scenario: The list is open again on return
- **WHEN** on a 1280 px screen the user opens Plan from a list in the Week, opens Today and then the Week again
- **THEN** the planning list is open, and after closing it with its close button, opening Today and the Week again, the panel slot is empty

#### Scenario: Not on a phone
- **WHEN** the planning list was left open and the user opens the Week on a 390 px screen
- **THEN** the list does not open by itself
