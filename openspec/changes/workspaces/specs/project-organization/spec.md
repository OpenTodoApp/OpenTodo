## MODIFIED Requirements

### Requirement: Project fields
A project SHALL have a name, a colour, a sort position, an archived flag, an optional parent project, creation time, optional deletion time, a note held as a Markdown `description` with its mergeable `notes_doc` document (see `project-notes`), and an additive `workspace_id` naming the workspace it belongs to (absent or null means the account's default workspace), written and synced as an ordinary operation that converges by last-writer-wins. A sub-project SHALL belong to the workspace of its parent; a parent in another workspace SHALL be treated as missing (the project shows at the top level of its own workspace).

#### Scenario: Create a project
- **WHEN** the user creates a project with a name
- **THEN** it appears in the sidebar immediately as a top-level project of the current workspace with an assigned colour and an empty note, and opens as the current view

#### Scenario: Project synced before the note existed
- **WHEN** a device holds a project row received before the note fields existed
- **THEN** the project reads as having an empty note, and no operation is written until someone edits it

#### Scenario: Project synced before workspaces existed
- **WHEN** a device holds a project row received before the `workspace_id` field existed
- **THEN** the project reads as belonging to the default workspace, and no operation is written

#### Scenario: Parent in another workspace
- **WHEN** a project's `parent_id` names a project of another workspace
- **THEN** the project is shown at the top level of its own workspace until the parent is in the same workspace, and no data is changed

### Requirement: Inbox is the default container
A task SHALL be an Inbox task while it is open, not deleted, has no project, is not scheduled, and no task above it (its parent, that parent's parent and so on) has a project or is scheduled: a subtask is part of its parent's plan and follows it out of the Inbox. Whether such a parent is open, completed or deleted SHALL NOT matter; a parent the device or server does not know ends the check. An Inbox task belongs to the Inbox of its workspace: the workspace its `workspace_id` names, or the default workspace when the field is absent. A task SHALL be scheduled when it has a do-on date (`due`), a start date (`start` set to a date) or is parked in Someday (`start` set to `someday`). A deadline, a reminder, a repeat rule without a do-on date, a label or an assignee SHALL NOT make a task scheduled. Membership SHALL be computed on every device from the task's own fields, with no operation written, so it works offline and changes exactly when those fields converge. Every place that lists or counts the Inbox (the Inbox view and its counts, the Process control and the triage queue, the weekly review, the Daily check, the Open Loops pulse, the command-line client, the assistant tools and resources) SHALL use this one rule. Every workspace SHALL have an Inbox that always exists and SHALL not be deletable or renamable. The Inbox view, its counts and the process flow SHALL show the current workspace's Inbox only.

#### Scenario: Task without project
- **WHEN** a task is created outside any project view or its project is cleared
- **THEN** it is listed in the Inbox of the current workspace, carrying that workspace's id

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

#### Scenario: Project cleared keeps the workspace
- **WHEN** a task in "Website" of "Work" has its project cleared from a device in Work
- **THEN** it is listed in Work's Inbox, not in the default workspace's

#### Scenario: Two Inboxes stay apart
- **WHEN** "Personal" has 3 Inbox tasks and "Work" has 5
- **THEN** the sidebar in Personal reads "Inbox 3", the switcher lists "Work · Inbox 5", and neither view lists the other's tasks

