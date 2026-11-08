## MODIFIED Requirements

### Requirement: Available tasks
A task SHALL be **available** when all of the following hold:
- it is live and open
- it is not blocked by an open task (task-dependencies "Blocked state is derived")
- it is not waiting in sequence
- its start is neither Someday nor a date after the user's logical today

A subtask SHALL be available only when it meets these conditions itself, no parent on its way up holds it ("Subtasks one at a time"), and its top-level task does not wait in sequence. Availability SHALL say nothing about assignment, project role or archived projects: those stay the conditions of the views that use it.

Availability SHALL be computed on every device from local rows, with no field or operation of its own. It SHALL change as soon as the underlying rows change locally or arrive by sync. The web app and the server SHALL compute it with the same rules, checked against one shared set of test vectors.

#### Scenario: Deferred step
- **WHEN** a task in a parallel project starts next Monday
- **THEN** it is not available until Monday, and it is available on Monday without any write

#### Scenario: Subtask of a waiting step
- **WHEN** "Pack kitchen" waits in sequence and has the subtask "Buy boxes"
- **THEN** "Buy boxes" is not available either

#### Scenario: Server and app agree
- **WHEN** the agent tools list available tasks for a user whose devices are synced
- **THEN** they return the same tasks the web app shows as available, for every case in the shared vectors

## ADDED Requirements

### Requirement: Subtasks one at a time
A task SHALL have a `flow_mode` saying how its own subtasks flow: `sequential` one at a time, anything else (empty by default, `parallel`, missing or unknown) all together. It SHALL be an additive string field, written through the operation log, applied locally at once (offline too), converging by last-writer-wins, never encrypted and included in the export; a client SHALL keep a value it does not know and write nothing to normalise it.

When a task's subtasks go one at a time, its first open subtask in list order that is not skipped (recurring, a habit or in Someday) SHALL be offered, and every other open, not-skipped subtask SHALL wait in sequence, held by that first subtask, together with everything under it. Walking up from a task, the nearest parent that holds it SHALL be the one its marker names; when no parent holds it, the project and section rules SHALL apply as before. The parent itself SHALL not wait because of its subtasks. This SHALL hold in any project and in the Inbox.

The task page and the docked task panel SHALL show a switch, One at a time, above the subtasks of a task with two subtasks or more, for those who may change the task; a viewer SHALL see it, disabled, only while it is on. Changing it SHALL be one operation with Undo. REST SHALL accept `flow_mode` on task create and patch as `""`, `parallel` or `sequential`, with `null` clearing it, refuse anything else with `400 invalid_input` naming the field and write nothing; the agent tools `create_tasks` and `update_tasks` SHALL accept the same values.

#### Scenario: Prepare before buying
- **WHEN** "Paint the doghouse" has its subtasks one at a time: "Prepare" (with "Choose a colour" and "Learn how" under it), then "Buy supplies" (with "Paint" and "Roller"), then "Paint it"
- **THEN** "Prepare", "Choose a colour" and "Learn how" are available; "Buy supplies", "Paint", "Roller" and "Paint it" are dimmed and read "After Prepare"

#### Scenario: Completing the step offers the next
- **WHEN** the user completes "Prepare" and its subtasks, offline
- **THEN** "Buy supplies" with "Paint" and "Roller" become available at once, and "Paint it" reads "After Buy supplies"

#### Scenario: Turn it on from the task page
- **WHEN** the user opens "Paint the doghouse" and turns on One at a time
- **THEN** one operation is written, a toast offers Undo, and the list shows the later subtasks waiting

#### Scenario: An older client
- **WHEN** a 1.0 client syncs a task whose `flow_mode` is `sequential`
- **THEN** it shows every subtask as available, keeps the field and writes no operation for it

#### Scenario: Invalid value through the API
- **WHEN** a script PATCHes `{"flow_mode":"area"}` to a task
- **THEN** the response is 400 `invalid_input` naming `flow_mode`, and the task is unchanged

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials PATCHes a task's `flow_mode`
- **THEN** the response is 401 `unauthorized` and nothing is written
