## MODIFIED Requirements

### Requirement: List tasks
`ot list` SHALL print open tasks sorted like the web views, with `--inbox` (the Inbox tasks of OpenSpec `project-organization`: no project and not scheduled), `--today` (due today or earlier, overdue first), `--upcoming`, `--project <name-or-id>`, `--completed` and `--all` filters, plus `--limit`. Human output SHALL show an id prefix, priority, due date and time, project and title; dates SHALL be evaluated in the local time zone. Aliases `ot today`, `ot inbox` and `ot upcoming` SHALL exist.

#### Scenario: Today view
- **WHEN** the user runs `ot today` with one overdue and one task due today
- **THEN** both are listed with the overdue task first and its date marked as overdue

#### Scenario: Unknown project
- **WHEN** `--project` names no existing project
- **THEN** the command exits with code 2 and lists the available project names

#### Scenario: Inbox leaves out planned tasks
- **WHEN** the user has two tasks without a project, one undated and one due Friday, and runs `ot inbox`
- **THEN** only the undated task is printed
