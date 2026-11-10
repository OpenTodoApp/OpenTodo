## ADDED Requirements

### Requirement: Urgency order on project and label pages
A project page in the List layout, a label page and the Inbox SHALL offer **Urgency** in Order by, after Title and before any custom field (OpenSpec `urgency-score`). Choosing it SHALL order the top-level tasks by score, most urgent first, and set the direction to ascending, which for this order reads **Most urgent first**; the direction under More options SHALL offer **Least urgent first**, which reverses it. Ascending is the stored direction of the most urgent first so that a client without the order, which reads `urgency` as the page's default, shows that default order and not its reverse. Equal scores SHALL fall back to due date, priority, position and task id, in that order. Subtasks SHALL stay under their parent, and the Later and Completed groups at the end. The choice SHALL be stored as `sort_by` `urgency` in the user's preferences of that project or on the label, like every order: written locally first, working offline, converging per field by last-writer-wins, and read as the default by clients that do not know it, without being rewritten. The order SHALL follow changes at once: a task whose score changes, locally or after sync, moves to its new place.

#### Scenario: Order a project by urgency
- **WHEN** the user opens Display options on "Work" and chooses Urgency
- **THEN** the task with the highest score is first, the direction reads Most urgent first, and the choice is stored for "Work" only as `sort_by` `urgency` with `sort_dir` `asc`

#### Scenario: Offline and on another device
- **WHEN** the device is offline and the user orders the label "errand" by urgency, then reconnects, and opens "errand" on the phone after sync
- **THEN** both devices list the errands by urgency

#### Scenario: Older client
- **WHEN** a client without urgency support opens a project ordered by urgency
- **THEN** it shows manual order, not reversed, and leaves the stored `urgency` unchanged

#### Scenario: Personal on a shared project
- **WHEN** Ana orders the shared project "Launch" by urgency
- **THEN** Ben, a member, still sees "Launch" in his own order

#### Scenario: Blocker completed
- **WHEN** a project is ordered by urgency and the task blocking "Book flights" is completed
- **THEN** "Book flights" moves up at once, because its blocked component is gone

### Requirement: Urgency score shown with its order
While a list is ordered by urgency, each top-level list row from 640 px SHALL show its score with one decimal in the faint tone with tabular figures in the row's trailing group, as a button named "Urgency <score>, show why". Focusing it SHALL show the breakdown as a tooltip, one component per part with its label and signed value, then the total with two decimals, and hovering it SHALL do the same where the row's revealed actions do not cover it; while it has the focus the revealed actions SHALL give way so it stays visible. Enter or Space on it SHALL open the same breakdown as a popover, and Escape SHALL close it and return focus to the button. For one task the row's menu (its More button, a right-click or a touch hold) SHALL offer **Why here?**, opening the same breakdown in the menu, a bottom sheet below 640 px. Below 640 px rows SHALL show no score. Subtask rows, cards and lists in any other order SHALL show no score, and the menu SHALL have no **Why here?** in any other order.

#### Scenario: Breakdown from the keyboard
- **WHEN** a list is ordered by urgency and the user tabs to the score of a priority-1 task due today that blocks two tasks and was created 30 days ago
- **THEN** the tooltip reads "Due today +8.80 · Priority 1 +6.00 · Blocks 2 tasks +8.00 · Age 30 d +0.16 = 22.96" and the chip reads 23.0

#### Scenario: Keyboard popover
- **WHEN** the user presses Enter on a row's score
- **THEN** the breakdown opens as a popover, and Escape closes it with focus back on the score

#### Scenario: From the row menu
- **WHEN** a list ordered by urgency is open on a desktop, where the revealed actions cover a hovered row's end, and the user opens a row's menu
- **THEN** **Why here?** shows the breakdown

#### Scenario: Phone
- **WHEN** a list ordered by urgency is opened at 390 px and the user opens a row's touch menu
- **THEN** the row shows no score, and the menu's "Why here?" opens the breakdown in a bottom sheet

#### Scenario: Other orders show nothing
- **WHEN** the same list is ordered by priority
- **THEN** no row shows a score and the menu has no "Why here?"
