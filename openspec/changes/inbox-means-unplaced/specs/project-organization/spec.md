## MODIFIED Requirements

### Requirement: Inbox is the default container
A task SHALL be an Inbox task while it is open, not deleted, has no project, is not scheduled, and no task above it (its parent, that parent's parent and so on) has a project or is scheduled: a subtask is part of its parent's plan and follows it out of the Inbox. Whether such a parent is open, completed or deleted SHALL NOT matter; a parent the device or server does not know ends the check. A task SHALL be scheduled when it has a do-on date (`due`), a start date (`start` set to a date) or is parked in Someday (`start` set to `someday`). A deadline, a reminder, a repeat rule without a do-on date, a label or an assignee SHALL NOT make a task scheduled. Membership SHALL be computed on every device from the task's own fields, with no operation written, so it works offline and changes exactly when those fields converge. Every place that lists or counts the Inbox (the Inbox view and its counts, the Process control and the triage queue, the weekly review, the Daily check, the Open Loops pulse, the command-line client, the assistant tools and resources) SHALL use this one rule. The Inbox SHALL always exist and SHALL not be deletable or renamable.

#### Scenario: Task without project
- **WHEN** a task is created outside any project view or its project is cleared
- **THEN** it is listed in the Inbox while it has no do-on date, no start and is not in Someday

#### Scenario: Subtask of a scheduled parent
- **WHEN** a task without a project has a do-on date and two subtasks without a project or any date
- **THEN** neither the task nor its subtasks are in the Inbox or its count, and when the parent's date is removed all three are back in the Inbox

#### Scenario: Scheduling takes a task out of the Inbox
- **WHEN** an Inbox task without a project is given the do-on date Friday
- **THEN** it leaves the Inbox and its count on every device once the date syncs, it is listed in Upcoming under Friday, and no other field is written

#### Scenario: Clearing the date brings it back
- **WHEN** the user removes the do-on date of a task without a project and without a start
- **THEN** the task is listed in the Inbox again, at its manual position

#### Scenario: A deadline alone does not schedule
- **WHEN** a task without a project has only the deadline 2026-11-06
- **THEN** it stays in the Inbox, and it also appears in Today and Upcoming as the deadlines capability defines

#### Scenario: Concurrent edits converge
- **WHEN** device A gives an Inbox task the start next Monday while device B, offline, moves it into "Home", and both sync
- **THEN** every device shows the task in "Home" starting next Monday and not in the Inbox, because membership follows the converged fields

#### Scenario: Someday is a decision
- **WHEN** the user parks a task without a project in Someday
- **THEN** it leaves the Inbox and is listed in the Someday view

### Requirement: Open task counts
The sidebar SHALL show the number of Inbox tasks (OpenSpec `project-organization`, "Inbox is the default container"), the number of open tasks for Today and for each project. For a collapsed project the count SHALL include the open tasks of all its non-archived, non-deleted descendants; for an expanded project it SHALL count only the project's own tasks. Counts SHALL be computed from local data so they are correct offline.

#### Scenario: Counts update live
- **WHEN** a task in a project is completed
- **THEN** that project's count decreases without a page reload

#### Scenario: Rolled-up count when collapsed
- **WHEN** "Home" has 2 open tasks and its sub-project "Garden" has 3, and "Home" is collapsed
- **THEN** the sidebar shows 5 next to "Home"; expanding it shows 2 next to "Home" and 3 next to "Garden"

#### Scenario: Inbox count follows scheduling
- **WHEN** the Inbox count reads 5 and the user schedules one of its tasks for tomorrow
- **THEN** the count reads 4 at once, offline too, and the tab bar on a phone shows the same number
