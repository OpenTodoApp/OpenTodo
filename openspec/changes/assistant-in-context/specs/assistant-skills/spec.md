# Spec Delta

## ADDED Requirements

### Requirement: Skills started in context
The server SHALL offer the skills `rewrite-task` (Rewrite this), `find-slot` (Find a slot), `project-next` (What's next?) and `brief-today` (Brief me). Each SHALL be started from its context while the assistant is available: the first two from a task's menu and panel, `project-next` from a project's header menu, and `brief-today` from Today's overflow menu. The subject is selected and the turn sent at once.

#### Scenario: Rewrite from a task
- **WHEN** the user chooses Rewrite this on the task "fix thing"
- **THEN** the assistant opens with the skill and that task selected, and answers with a proposal for a clearer title and description

#### Scenario: Not available
- **WHEN** the assistant is off for the user
- **THEN** none of these menu items is shown

### Requirement: Find a slot plans into free time
The `find-slot` skill SHALL use `find_free_time` for the next 7 days within the working day. It SHALL propose one do-on date and time for the selected task whose estimate (30 minutes when absent) fits a free slot, and say when nothing fits.

#### Scenario: A free slot
- **WHEN** the selected task has an estimate of 60 minutes and tomorrow is free from 14:00 to 16:00
- **THEN** the proposal sets its do-on date to tomorrow at 14:00
