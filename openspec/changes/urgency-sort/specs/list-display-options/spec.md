## ADDED Requirements

### Requirement: Urgency order on project and label pages
A project page in the List layout and a label page SHALL offer **Urgency** in Order by, after Title and before any custom field (OpenSpec `urgency-score`). Choosing it SHALL order the top-level tasks by score, highest first, and set the direction to descending; the direction under More options SHALL still reverse it. Equal scores SHALL fall back to due date, priority, position and task id, in that order. Subtasks SHALL stay under their parent, and the Later and Completed groups at the end. The choice SHALL be stored as `sort_by` `urgency` in the user's preferences of that project or on the label, like every order: written locally first, working offline, converging per field by last-writer-wins, and read as the default by clients that do not know it, without being rewritten. The order SHALL follow changes at once: a task whose score changes, locally or after sync, moves to its new place.

#### Scenario: Order a project by urgency
- **WHEN** the user opens Display options on "Work" and chooses Urgency
- **THEN** the task with the highest score is first, the direction reads descending, and the choice is stored for "Work" only

#### Scenario: Offline and on another device
- **WHEN** the device is offline and the user orders the label "errand" by urgency, then reconnects, and opens "errand" on the phone after sync
- **THEN** both devices list the errands by urgency

#### Scenario: Older client
- **WHEN** a client without urgency support opens a project ordered by urgency
- **THEN** it shows manual order and leaves the stored `urgency` unchanged

#### Scenario: Personal on a shared project
- **WHEN** Ana orders the shared project "Launch" by urgency
- **THEN** Ben, a member, still sees "Launch" in his own order

#### Scenario: Blocker completed
- **WHEN** a project is ordered by urgency and the task blocking "Book flights" is completed
- **THEN** "Book flights" moves up at once, because its blocked component is gone

### Requirement: Urgency score shown with its order
While a list is ordered by urgency, each top-level row from 640 px SHALL show its score with one decimal in the faint tone with tabular figures in the row's trailing group, as a button named "Urgency <score>, show why". Hovering it SHALL show the breakdown as a tooltip, one component per part with its label and signed value, then the total with two decimals; Enter or Space on it SHALL open the same breakdown as a popover, and Escape SHALL close it and return focus to the button. Below 640 px rows SHALL show no score, and the touch row menu SHALL offer "Why here?", opening the breakdown in a bottom sheet. Subtask rows and lists in any other order SHALL show no score.

#### Scenario: Breakdown on hover
- **WHEN** a list is ordered by urgency and the user hovers the score of a priority-1 task due today that blocks two tasks and was created 30 days ago
- **THEN** the tooltip reads "Due today +8.80 · Priority 1 +6.00 · Blocks 2 tasks +8.00 · Age 30 d +0.16 = 22.96" and the chip reads 23.0

#### Scenario: Keyboard
- **WHEN** the user tabs to a row's score and presses Enter
- **THEN** the breakdown opens as a popover, and Escape closes it with focus back on the score

#### Scenario: Phone
- **WHEN** a list ordered by urgency is opened at 390 px and the user opens a row's touch menu
- **THEN** the row shows no score, and the menu's "Why here?" opens the breakdown in a bottom sheet

#### Scenario: Other orders show nothing
- **WHEN** the same list is ordered by priority
- **THEN** no row shows a score and the touch menu has no "Why here?"
