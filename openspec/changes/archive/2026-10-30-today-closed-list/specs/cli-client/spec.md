# Spec Delta

## ADDED Requirements

### Requirement: Today limit and logged wins in the CLI
While the user's Today limit is on, `ot today` SHALL print the tasks in the slots, then a "Waiting for a slot" heading with the waiting tasks in fill order (OpenSpec `today-closed-list`); `--all` SHALL print every task without the heading, and `--json` SHALL carry `waiting_for_slot` on each task. `ot add --done <title>` SHALL create the task already completed now by the user, in one request, refusing `--repeat` and `--remind` with a usage error.

#### Scenario: Waiting section
- **WHEN** the limit is 2 and Today has three tasks
- **THEN** `ot today` prints two tasks, then "Waiting for a slot" and the third

#### Scenario: Log a win from the terminal
- **WHEN** the user runs `ot add --done "Fixed the printer"`
- **THEN** the task is created completed, and `ot list --completed` shows it under today

#### Scenario: Win that repeats
- **WHEN** the user runs `ot add --done "Stretch" --repeat "every day"`
- **THEN** the command exits with a usage error and creates nothing
