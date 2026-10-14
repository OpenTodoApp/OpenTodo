# Spec Delta

## Purpose

Lets the user tick several tasks in a list and complete, prioritise, label, reschedule, move, assign or trash them in one step, written as one batch of operations that can be undone in one step.

## ADDED Requirements

### Requirement: Select tasks with the keyboard
In a task list `x` or Space SHALL tick or untick the cursor row, `Shift+↓`/`Shift+↑` (also `Shift+J`/`Shift+K` without Vim keybindings) SHALL move the cursor and select the range from where ticking started, `Ctrl`/`⌘`+`A` SHALL tick every row once one is ticked, and Escape SHALL clear the ticks before the cursor. The cursor stays distinct from the ticked set; read-only tasks are never ticked. The selection is device interface state: no data, nothing synced.

#### Scenario: Tick and extend
- **WHEN** the cursor is on the second row and the user presses `x`, then `Shift+↓` twice
- **THEN** rows two, three and four are ticked, the cursor is on row four, and the bar reads "3 selected"

#### Scenario: Shrink the range
- **WHEN** rows two to four are ticked by extension and the user presses `Shift+↑`
- **THEN** row four is unticked, rows two and three stay ticked, and the cursor is on row three

#### Scenario: Select all
- **WHEN** one row is ticked and the user presses `Ctrl+A`
- **THEN** every row shown in the list is ticked except read-only ones, and the browser's own select-all does not run

#### Scenario: Escape order
- **WHEN** three rows are ticked, the detail panel of the cursor task is open and the user presses Escape twice
- **THEN** the first Escape closes the panel and the second clears the ticks, leaving the cursor where it was

#### Scenario: Space with no cursor
- **WHEN** no row is the cursor and the user presses Space outside a text field
- **THEN** nothing is ticked and the page scrolls as usual

### Requirement: Select with a pointer or on touch
Each row SHALL show a selection checkbox when the pointer is over it, when it is the cursor row and whenever any row is ticked; on devices without hover a Select button in the list header SHALL show the checkboxes on every row until Done. Clicking a checkbox SHALL tick that row, Shift+click SHALL select the range from where ticking started, and `Ctrl`/`⌘`+click on a row SHALL tick it without opening it. Checkboxes SHALL be at least 44×44 px on touch screens and announce their state.

#### Scenario: Range by Shift+click
- **WHEN** the user ticks the first row's checkbox and Shift+clicks the fifth row
- **THEN** rows one to five are ticked and none opens

#### Scenario: Touch selection mode
- **WHEN** a user on a phone taps Select, ticks two rows and taps Done
- **THEN** the checkboxes hide again, the two rows stay ticked and the bar stays shown until the selection is cleared or used

### Requirement: Where selection is available
Selection SHALL work in the Inbox, Today, Upcoming, Assigned to me, Completed, project lists and boards, label views, the Filter view and saved views. On a board `Shift+↓`/`↑` extend within the column. It SHALL NOT be offered on dashboards or in the Day and Week calendars. Navigating to another view SHALL clear the selection, and a ticked task that leaves the list (completed, moved, filtered out) SHALL leave the selection.

#### Scenario: Filter view
- **WHEN** the user runs `@errand` in the Filter view, ticks three results and presses `c`
- **THEN** the three tasks are completed and leave the results, and the bar disappears

#### Scenario: Board column
- **WHEN** a card is ticked on a board and the user presses `Shift+↓`
- **THEN** the next card of the same column is ticked

### Requirement: Selection bar and Actions menu
While tasks are ticked the list SHALL show a bar with the count (announced to assistive technology), an Actions button and Clear. `.` SHALL open the Actions menu for the ticked tasks, or for the cursor task when nothing is ticked, outside text fields. The menu SHALL offer complete or reopen, priority 1–4, labels, date (today, tomorrow, next week, no date, pick a date), move to a project, move to a section, assign and move to Trash, each with its shortcut, and SHALL show an unavailable action disabled with the reason.

#### Scenario: Open the menu by key
- **WHEN** four rows are ticked and the user presses `.`
- **THEN** a menu titled "4 tasks" opens with focus on its first item, and Escape returns focus to the list

#### Scenario: Unavailable with a reason
- **WHEN** the ticked tasks belong to two different projects and the user opens the Actions menu
- **THEN** "Assign" is disabled and its description says the tasks must be in one shared project

### Requirement: Actions apply to every ticked task as one batch
Complete or reopen (`c`), priority (`1`–`4`), date and move to Trash (Delete) SHALL apply to every ticked task as one batch of operations written together: the change shows at once on every affected row, is queued while offline, syncs as ordinary per-field operations and converges by last-writer-wins per task and field. A recurring task SHALL roll forward by its rule as a single completion does; completing or trashing a parent SHALL include its open subtasks; a task listed twice through its parent SHALL get each change once.

#### Scenario: Complete five offline
- **WHEN** the device is offline, five rows are ticked, one of them repeating every week, and the user presses `c`
- **THEN** four tasks gain a completion time, the recurring one gets a completed occurrence and moves to next week, all five changes leave the view at once and reach other devices after the next sync

#### Scenario: Mixed completion state
- **WHEN** two ticked tasks are open and one is completed and the user presses `c`
- **THEN** the two open tasks are completed and the completed one is left as it is; pressing `c` on a selection of only completed tasks reopens them

#### Scenario: Reschedule
- **WHEN** three rows are ticked and the user chooses Date → Tomorrow
- **THEN** each task is due tomorrow with its time of day kept, and tasks that had no date are due tomorrow without a time

#### Scenario: Concurrent edit converges
- **WHEN** a batch sets priority 1 on ten tasks while a phone changes the title of one of them offline, and both sync
- **THEN** every device shows that task with priority 1 and the new title

#### Scenario: Parent and subtask both ticked
- **WHEN** a parent and one of its subtasks are both ticked and the user presses Delete
- **THEN** the parent and all its subtasks are in the Trash, each with one deletion operation

### Requirement: Labels on several tasks
`L` or Labels with tasks ticked SHALL open the label picker showing labels carried by every ticked task as checked. Picking an unchecked label SHALL add it to each ticked task that lacks it; picking a checked label SHALL remove it from each. Each task's label array SHALL be read immediately before it is written, inside the batch, and written whole, so sequential edits on one device never lose a label; concurrent writes converge per task by last-writer-wins as for a single task.

#### Scenario: Add a label to three tasks
- **WHEN** three tasks are ticked, one already carrying "errand", and the user picks "errand"
- **THEN** the two others gain "errand", the first keeps its labels unchanged, and the picker stays open

#### Scenario: Remove a common label
- **WHEN** every ticked task carries "waiting" and the user picks the checked "waiting"
- **THEN** "waiting" is removed from each ticked task and their other labels are kept

### Requirement: Moves and assignments are reviewed first
Moving ticked tasks to a project or section and assigning them SHALL first show the list of changes, one per task with old → new, shared destinations marked, every item checked; Enter applies the checked items as one batch and Escape discards. A move into another sharing scope SHALL be shown as "copied into <project>" and SHALL be written as the copy-and-tombstone the single-task move uses. Assign SHALL be offered only when every ticked task is in the same shared project. Applied changes converge like any edit.

#### Scenario: Move with review
- **WHEN** six Inbox tasks are ticked and the user chooses Move to → "Home", unticks one in the review and presses Enter
- **THEN** five tasks are in "Home", the sixth stays in the Inbox, and the summary reads "5 of 6 changes applied"

#### Scenario: Move into a shared project
- **WHEN** the user moves two personal tasks to a shared project and applies the review
- **THEN** each task is copied into the shared project under a new id and the original is in the Trash, in one batch, as the single-task move does

#### Scenario: Discard
- **WHEN** the review is shown and the user presses Escape
- **THEN** nothing is written and the selection is kept

### Requirement: Undo a bulk action in one step
After a bulk action a toast SHALL name it ("12 tasks completed") with an Undo control for ten seconds; the control, or `Ctrl`/`⌘`+`Z` outside a text field while the toast shows, SHALL restore the previous values as one new batch, offline-capable and convergent. A field changed again since the action SHALL be skipped and the task named. Copies made by a cross-scope move SHALL go to the Trash and the originals SHALL be restored. The last 20 batches SHALL stay undoable on the device; undo state SHALL be device-local, never synced or exported, and cleared at sign-out.

#### Scenario: Undo a reschedule
- **WHEN** the user rescheduled eight tasks to tomorrow and activates Undo
- **THEN** each task has its previous due date (or none) on every device after sync, and each task's history shows the reschedule and the restore

#### Scenario: Field changed since
- **WHEN** after completing five tasks the user reopened one by hand, then presses `Ctrl+Z`
- **THEN** the four others are reopened, the hand-edited one is left alone and the toast names it

#### Scenario: Toast is keyboard reachable
- **WHEN** a bulk action's toast is shown and the user presses Tab
- **THEN** the Undo control receives focus and Enter undoes

### Requirement: Discoverability
The `?` overlay and the keyboard guide SHALL list the selection keys and `.`, and the tasks guide SHALL explain selecting several tasks and undoing a bulk action.

#### Scenario: Listed in the shortcut help
- **WHEN** the user presses `?`
- **THEN** the "Tasks in a list" section lists `x` / Space, `Shift+↓` / `Shift+↑`, `Ctrl/⌘+A`, `.` and `Ctrl/⌘+Z`
