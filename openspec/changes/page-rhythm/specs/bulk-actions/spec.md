## ADDED Requirements

### Requirement: Group actions are one batch
An action offered on a list group header for every task of the group (Today's Earlier group: Move all to today, Reschedule…) SHALL be written as one batch of operations exactly like the same action on a ticked selection: the change shows at once on every row of the group, is queued while offline, syncs as ordinary per-field operations, converges by last-writer-wins per task and field, follows the single-task rules for repeating tasks and subtasks, and reaches a task once. It SHALL offer the same Undo toast for ten seconds, naming the action ("4 tasks moved to today"), and `Ctrl`/`⌘`+`Z` outside a text field while the toast shows SHALL undo it; a field changed since the action is skipped and the task named. A group action SHALL NOT require a selection and SHALL leave any existing selection untouched. Read-only tasks in the group SHALL be left as they are and counted in the toast ("3 of 4 tasks moved to today").

#### Scenario: Group action without a selection
- **WHEN** two rows of a project are ticked and the user activates "Move all to today" on Today's Earlier group in another tab of the same device
- **THEN** the Earlier tasks move as one batch, the project's selection is unchanged, and the toast offers Undo

#### Scenario: Read-only task in the group
- **WHEN** Earlier holds three of the user's tasks and one task of a shared project the user can only view, and the user activates "Move all to today"
- **THEN** the three tasks are due today, the viewed task is unchanged and stays in Earlier, and the toast reads "3 of 4 tasks moved to today"

#### Scenario: Concurrent edit converges
- **WHEN** Reschedule… → Next week runs on five tasks while a phone retitles one of them offline, and both sync
- **THEN** every device shows that task due next week with the new title
