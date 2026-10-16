# weekly-review Specification

## Purpose
A guided weekly review built into the app: four steps with live data (get clear, look back, next actions, look ahead), a record of when the last review was finished, and a sidebar marker when a review is due.

## Requirements

### Requirement: Review steps
The Review screen SHALL offer four steps in order, each showing live data and whether it is done: Get clear (the Inbox; done when empty), Look back (this week's completions and the overdue tasks; done when nothing is overdue), Next actions (projects without a next action; done when none remains) and Look ahead (the next seven days; always done). Steps SHALL be computed from local rows and work offline.

#### Scenario: Inbox step
- **WHEN** the Inbox holds three open tasks
- **THEN** Get clear lists them with the usual row actions, shows "3 to process" and offers to open the Inbox; it reads as done once the three are moved, completed or trashed

#### Scenario: Overdue step
- **WHEN** two tasks are overdue
- **THEN** Look back shows this week's completed count and the two tasks; completing one with `c` or giving it a new date removes it from the step

### Requirement: Projects without a next action
The Next actions step SHALL list the live, unarchived projects the user can add tasks to that have no open live task, and SHALL offer "Archive" only on those the user may archive.

#### Scenario: Project without a next action
- **WHEN** project "Garage" has only completed tasks and "Taxes" has one open task
- **THEN** Next actions lists Garage with "Add a next action" and "Archive", and not Taxes

#### Scenario: Shared project the user cannot edit
- **WHEN** the user is a viewer of a shared project with no open task
- **THEN** that project is not listed in Next actions

### Requirement: Adding a next action or archiving from the review
"Add a next action" SHALL open quick add scoped to that project and the new task SHALL remove the project from the step. "Archive" SHALL archive the project through the ordinary op, so it is undone like any archive and converges on every device.

#### Scenario: Add a next action
- **WHEN** the user chooses "Add a next action" on Garage and types "Buy shelf brackets"
- **THEN** the task is created in Garage and Garage leaves the Next actions list

#### Scenario: Archive offline
- **WHEN** the user archives a project from the review while offline
- **THEN** the project is archived locally at once and the op is sent when the connection returns

### Requirement: Finishing a review
"Finish review" SHALL write `completed_at` on the user's `review` entity (id `me`, personal scope) through the operation log. The entity SHALL sync to every device of the user, SHALL be written offline through the outbox, and SHALL converge by last-writer-wins so the latest finish wins. It is not user-written content and is never encrypted. It SHALL be included in the JSON export and SHALL derive no activity event.

#### Scenario: Finish on one device
- **WHEN** the user finishes a review on the laptop and later opens the phone
- **THEN** both show the same "Last review" time after sync

#### Scenario: Two finishes offline
- **WHEN** two devices finish a review while offline, then sync
- **THEN** every device shows the later of the two times

#### Scenario: Older server
- **WHEN** the device syncs with a server that does not know the `review` entity
- **THEN** the op is rejected as unknown, the device keeps its local value, and nothing else is affected

### Requirement: Review screen and sidebar marker
The web app SHALL show Review at `/review`, reachable from the sidebar and by `g` then `r`. Steps SHALL be tabs the arrow keys move between, each showing done or the count left; lists inside use the list shortcuts. The sidebar entry SHALL show when the last review was, and a marker when it was more than seven days ago or never. The screen SHALL open on the first step that is not done.

#### Scenario: Review due
- **WHEN** the last review was finished nine days ago
- **THEN** the sidebar's Review entry carries a "due" marker and a text alternative, and opening it starts on the first unfinished step

#### Scenario: Keyboard path
- **WHEN** the user presses `g` then `r`, then the right arrow twice, then `j` and Enter
- **THEN** Review opens, the third step is shown, the first project row is selected and "Add a next action" opens quick add for it

#### Scenario: Everything done
- **WHEN** every step is done
- **THEN** the screen says so, "Finish review" is the primary action, and finishing shows the time and returns focus to the steps
