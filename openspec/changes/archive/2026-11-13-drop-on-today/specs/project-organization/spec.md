## ADDED Requirements

### Requirement: Drop a task on Today
A task dragged from a list or a board SHALL be droppable on the Today entry of the sidebar. While the pointer is over it, Today SHALL show the drop ring and the list SHALL not show a drop line. Dropping SHALL plan the task for today by the rule of a drop on a day group in Upcoming (`upcoming-drag`): the do-on date moves to today and keeps its time, a span moves whole, the deadline stays and a deferred task becomes due today, through the operation log, and a toast SHALL read "Scheduled for today" with Undo. When the dragged task is part of the bulk selection, every selected task SHALL be planned as one batch, and tasks already planned for today SHALL write nothing. Dropping a task the user may not edit, or pressing Escape, SHALL change nothing. The change SHALL apply locally at once, work offline through the outbox and converge per field like any date edit.

#### Scenario: Drop on Today
- **WHEN** the user drags "Report" from the project "Work" and releases it over Today in the sidebar
- **THEN** "Report" is planned for today and stays in "Work", and the toast reads "Scheduled for today" with Undo

#### Scenario: Keeps its time
- **WHEN** the user drops "Call", planned for Saturday at 09:30, on Today
- **THEN** "Call" is planned for today at 09:30

#### Scenario: Several selected tasks
- **WHEN** two selected tasks without a date are dropped on Today
- **THEN** both are planned for today, the toast reads "2 tasks scheduled for today", and one Undo puts both back

#### Scenario: Viewer of a shared project
- **WHEN** the user drags a task of a project where they are a viewer onto Today
- **THEN** nothing changes

#### Scenario: Offline
- **WHEN** the phone is offline and the user drops a task on Today, and the laptop renames the same task meanwhile
- **THEN** the task shows under Today at once, and after both sync every device shows the renamed task planned for today
