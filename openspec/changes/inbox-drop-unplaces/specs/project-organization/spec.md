## MODIFIED Requirements

### Requirement: Drop a task on a project
A task dragged from a list or a board SHALL be droppable on a project row in the sidebar, on the Inbox entry and on a pinned project in Favourites. While the pointer is over a target the target SHALL show the drop ring and the list SHALL not show a drop line. Dropping on a project SHALL move the task to that project exactly as the Move action does, with its sub-tasks, through the operation log, and a toast SHALL name the project with Undo. Dropping on the Inbox SHALL move the task to the Inbox as "Move to the Inbox" defines. When the dragged task is part of the bulk selection, every selected task SHALL move as one batch. Dropping on the project the task is already in, on a project the user may not add tasks to, or pressing Escape SHALL change nothing. The move SHALL apply locally at once, work offline through the outbox and converge per field like any move; on touch the drag starts after the same long press as reordering. `m` remains the keyboard way to move.

#### Scenario: Drop on a project
- **WHEN** the user drags "Buy paint" from the Inbox and releases it over "Home renovation" in the sidebar
- **THEN** the task leaves the Inbox and is in "Home renovation", and the toast reads "Moved to Home renovation" with Undo

#### Scenario: Drop a dated task on the Inbox
- **WHEN** a task without a project is due today and the user drags it from Today onto the Inbox in the sidebar
- **THEN** its do-on date is cleared, it leaves Today and is listed in the Inbox, and the toast reads "Moved to Inbox" with Undo

#### Scenario: Several selected tasks
- **WHEN** three tasks are selected and the user drags one of them onto "Work"
- **THEN** all three move to "Work" and one Undo moves all three back

#### Scenario: Viewer of a shared project
- **WHEN** the user drags a task over a project where they are a viewer
- **THEN** the project shows no drop ring and releasing there changes nothing

#### Scenario: Offline move converges
- **WHEN** the phone is offline, the user drops a task on "Work", and the laptop renames the same task meanwhile
- **THEN** after both sync every device shows the renamed task in "Work"

## ADDED Requirements

### Requirement: Move to the Inbox
Moving a task to the Inbox from the app (a drop on the sidebar's Inbox, "No project" in the task's project picker or the list's inline project field, a title edit, or bulk Move to the Inbox) SHALL make it an Inbox task: one batch SHALL clear its project and its schedule (do-on date, start, time sector, evening and part of the day), keeping its workspace as a move to no project does, with Undo restoring every field. A task already without a project but scheduled SHALL have its schedule cleared the same way; an Inbox task SHALL write nothing. A repeating task SHALL keep its schedule, since clearing its date would end the series; it SHALL still lose its project, and the toast SHALL say that it stays scheduled because it repeats. A move out of a shared project SHALL write the unscheduled copy as any move across sharing scopes does. A drop into a list's "No project" group and a move through REST, MCP, CalDAV or the CLI SHALL change only what they write. The batch SHALL apply locally at once, work offline through the outbox and converge per field by last-writer-wins. Wherever the app names the place of a task without a project that is not an Inbox task (the task panel, Today's and Upcoming's grouping by project), it SHALL say "No project", not "Inbox".

#### Scenario: Picker on a dated task in a project
- **WHEN** a task of "Home" is due Friday and the user picks "No project" in its project picker
- **THEN** it has no project and no do-on date, it is listed in the Inbox, and Undo puts it back in "Home" on Friday

#### Scenario: Repeating task
- **WHEN** a task without a project repeats every day and the user drops it on the Inbox
- **THEN** nothing is written, the task keeps its date, and the toast reads "It repeats, so it stays scheduled"

#### Scenario: Offline move converges
- **WHEN** the phone is offline and the user drops a dated task on the Inbox, while the laptop renames it
- **THEN** after both sync every device shows the renamed task in the Inbox, without a date

#### Scenario: A dated task without a project is named "No project"
- **WHEN** a task without a project is due today and the user opens it, or groups Today by project
- **THEN** the panel's place reads "No project" and the group heading reads "No project"
