# Spec Delta

## ADDED Requirements

### Requirement: Every task list is a phone screen
While the phone screens are on below 768 px, the Inbox, Today, Upcoming, Anytime, Someday, Assigned to me, Completed, a label's list, a place's list and a project in its List layout SHALL each be the phone list screen. This widens the opt-in requirement of this capability, which named Today and the task page only. The screen SHALL show the same tasks, in the same groups and the same order, as the list shows with the switch off, and the same loading, missing and empty states. A project in its Board, Timeline or Calendar layout SHALL keep the screen it has with the switch off.

Every change made on the screen SHALL be written as the same operations as the same action in the list with the switch off. It SHALL work offline, and it SHALL converge with changes from other devices exactly as that action does.

#### Scenario: The lists open in the phone UI
- **WHEN** the switch is on at 390 px and a person opens the Inbox, Upcoming, a label and a project in its List layout
- **THEN** each is the phone list screen, with the tasks, groups and order it has with the switch off

#### Scenario: A board stays as it is
- **WHEN** the switch is on at 390 px and a project's layout is Board
- **THEN** the project opens as the board it is with the switch off

#### Scenario: Offline
- **WHEN** the phone is offline and the person completes a task, moves another and adds a third in the phone list
- **THEN** the list shows all three changes at once, and after the phone is back online another device shows the same list

#### Scenario: A change from another device
- **WHEN** another device adds a task to the project the phone list shows
- **THEN** the task appears in the phone list in its place without a reload

### Requirement: The list's bar and menu
The phone list SHALL show its title large at the top, with one line under it for what the list's header shows as its summary (Today's date, limit and totals; a label's count; the Inbox's count), and the title SHALL move into the bar when the list is scrolled. The bar SHALL hold the menu button that opens the drawer, at most two of the list's own controls, and one menu.

Between them, the bar and the menu SHALL offer every action the list's header and page menu offer below 768 px with the switch off: the display options, the duration filter and the query filter with their active chips, Select tasks, the list's own items, and Print. An item that is not offered for a list with the switch off SHALL NOT be offered here.

#### Scenario: Today's menu
- **WHEN** a person opens the menu of Today in the phone list
- **THEN** it offers the display options, Select tasks, the briefing, calendar events, the parts of the day, the Today limit, Replan, Brief me and Print, as Today's page menu does with the switch off

#### Scenario: Sorting
- **WHEN** the person chooses Sort by priority in the display options of a label's phone list
- **THEN** the rows are in priority order, and the label's list on another device is in the same order after sync

#### Scenario: A filter shows as a chip
- **WHEN** the person sets the duration filter to 15 minutes in the Inbox
- **THEN** the bar shows the filter as a chip, the list shows only the tasks that fit, and a tap on the chip clears it

#### Scenario: A project's layout
- **WHEN** the person chooses Board in the menu of a project's phone list
- **THEN** the project is shown as its board, and choosing List there returns to the phone list

### Requirement: Rows in every list
A row of the phone list SHALL follow the phone task row of this capability: the check, the title on up to two lines, one line of facts. A subtask shown under its task SHALL be indented one step, and a task with subtasks in a list that nests them SHALL have a control that folds and unfolds them, with the fold remembered as it is with the switch off. A tap SHALL open the task page, the check SHALL complete or reopen the task, a swipe to the right SHALL complete it and a swipe to the left SHALL open the date sheet.

Completing the last open subtask SHALL offer to complete its parent, and completing the last open task of a project SHALL offer to archive the project, as with the switch off. A task the person may not edit SHALL have no swipe, and its check SHALL not respond.

#### Scenario: Subtasks under their task
- **WHEN** a project's task has three subtasks and the project's list nests subtasks
- **THEN** the three rows are indented under it, and its fold control hides and shows them

#### Scenario: The parent is offered
- **WHEN** the person completes the last open subtask of a task
- **THEN** the list offers to complete the parent, and accepting completes it with one Undo

#### Scenario: A read-only project
- **WHEN** the person opens a shared project in which they can only read
- **THEN** rows open the task page, and no row can be swiped, completed, dragged or selected

### Requirement: The row's menu
A hold on a row that ends without a move SHALL open the row's menu, the same menu with the same items as the list's row menu with the switch off, as a bottom sheet. Its Edit, Add task below and Add subtask SHALL open their field in the list at the row, with the on-screen keyboard up.

#### Scenario: The menu
- **WHEN** the person holds a row of the Inbox for 350 ms and lifts the finger
- **THEN** the row's menu opens as a bottom sheet with the items the Inbox's row menu has with the switch off

#### Scenario: Edit
- **WHEN** the person chooses Edit in the row's menu
- **THEN** the title becomes a field in the row with the keyboard open, and Done saves it

#### Scenario: Add a subtask
- **WHEN** the person chooses Add subtask in the row's menu of a project task
- **THEN** a field opens under the row, and each line entered becomes a subtask of that task

### Requirement: Selecting tasks
Select tasks in the list's menu SHALL put the list in selection: each row's check becomes a tick box, a tap on a row ticks or unticks it, and swipes are off. The selection bar SHALL show how many are ticked with Actions, Clear and Close, and Actions SHALL open the same bulk actions as with the switch off. Close SHALL end selection and return the rows to their checks. A task the person may not edit SHALL not be tickable.

#### Scenario: Select and act
- **WHEN** the person chooses Select tasks, ticks three rows and chooses Actions, then a priority
- **THEN** the three tasks have that priority, written as one batch with one Undo

#### Scenario: Leaving selection
- **WHEN** the person taps Close in the selection bar
- **THEN** nothing is ticked, the rows show their checks again and a tap opens a task

### Requirement: Reordering
In a list with a manual order (a project the person may edit, the Inbox, a label, Today and Upcoming in their day order), a hold on a row followed by a move SHALL lift the row and drop it where it is released, with the same rules as with the switch off: a place among its siblings, a depth in a list that nests, a section, a day in Upcoming, a project group in Today grouped by project. The row's menu SHALL offer Reorder with Move up, Move down, Move to top and Move to bottom, which do the same without a drag. In a list without a manual order nothing is lifted.

#### Scenario: Drag
- **WHEN** the person holds the third row of a project's list, moves it above the first and lifts the finger
- **THEN** the task is first, and it is first on another device after sync

#### Scenario: Without a drag
- **WHEN** the person opens the row's menu and chooses Reorder, Move to top
- **THEN** the task is first

#### Scenario: A sorted list
- **WHEN** a label's list is sorted by due date and the person holds a row and moves
- **THEN** nothing is lifted, and the hold opens the row's menu when released

### Requirement: Groups and sections
Groups SHALL have the heading, count and fold they have with the switch off, and a group's own actions (Today's Earlier menu, Log a win). A project's sections SHALL show their name, their menu with the items it has with the switch off, a way to add a task to the section, and "n completed" with Show when completed tasks are hidden. A project the person may edit SHALL offer Add section at the end of the list.

#### Scenario: A section's menu
- **WHEN** the person opens the menu of a section in a project's phone list
- **THEN** it offers what the section's menu offers with the switch off, and Rename renames the section

#### Scenario: Adding to a section
- **WHEN** the person chooses to add a task in the section "Waiting" and enters a line
- **THEN** the task is the last of that section

### Requirement: Each list keeps its own parts
The phone list SHALL show, for each list, what that list shows below 768 px with the switch off:

- the Inbox: the Process control with its count, the routines slot and the sample tasks with their notice;
- Today: the briefing, the day's calendar events, the habits strip, the Earlier group's actions, Done today, Log a win, Close the day, the away notice and the time totals;
- Upcoming: each day's calendar events, the later days summarised unless shown in full, projected occurrences and Start with Today;
- Completed: the search field, its own display options and the control that loads earlier days;
- a project: its note, linked references, sub-projects and the note about hidden tasks;
- every list: its empty state, the empty state of a filter that hides everything, and the missing state of a project, label or place that no longer exists.

#### Scenario: Process the Inbox
- **WHEN** the Inbox holds four tasks
- **THEN** the phone list offers Process 4, and it opens the same triage as with the switch off

#### Scenario: Upcoming's events
- **WHEN** calendar events are shown in Upcoming and tomorrow has two
- **THEN** tomorrow's group lists the two events before its tasks

#### Scenario: Search in Completed
- **WHEN** the person types a word in Completed's search
- **THEN** only completed tasks that match are listed

#### Scenario: An empty list
- **WHEN** Someday has no task
- **THEN** the phone list shows Someday's empty state

### Requirement: Adding from a list
The add button and its sheet SHALL add to the list on screen with that list's defaults, as with the switch off: a project's task in the project, a label's task with the label, Today's task today, a place's task at the place, and a pasted list of lines as one batch with one Undo. The phone list SHALL NOT show the add line at the top of the list; the add button is the one way to add a task that is not under a row or in a section.

#### Scenario: Adding in a label's list
- **WHEN** the person taps the add button in the list of the label "errands" and enters "Buy stamps"
- **THEN** the task has the label "errands" and appears in the list

#### Scenario: No add line
- **WHEN** the person opens the Inbox in the phone list
- **THEN** the first thing under the title is the Inbox's content, not an add line
