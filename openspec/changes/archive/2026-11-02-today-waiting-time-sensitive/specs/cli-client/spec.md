## MODIFIED Requirements

### Requirement: Today limit and logged wins in the CLI
While the user's Today limit is on, `ot today` SHALL print the tasks in the slots, then a "Waiting for a slot" heading with the waiting tasks in fill order (OpenSpec `today-closed-list`); the heading SHALL carry the number of waiting tasks and, when some are due today with a time or have a deadline today, the soonest of them with its time, followed by those tasks soonest first with their time (OpenSpec `today-waiting-time-sensitive`). `--all` SHALL print every task without the heading, and `--json` SHALL carry `waiting_for_slot` on each task and `time_sensitive` on each waiting task. `ot add --done <title>` SHALL create the task already completed now by the user, in one request, refusing `--repeat` and `--remind` with a usage error.

#### Scenario: Waiting section
- **WHEN** the limit is 2 and Today has three tasks
- **THEN** `ot today` prints two tasks, then "Waiting for a slot" and the third

#### Scenario: Time-sensitive waiting tasks
- **WHEN** the limit is 1 and "Send the form" at 16:00 and "Call the school" at 09:00 wait with two other tasks
- **THEN** `ot today` prints "Waiting for a slot · 4 — next: Call the school, 09:00", the two lines 09:00 then 16:00, then the waiting tasks in fill order, and `--json` has `time_sensitive: true` on those two

#### Scenario: Log a win from the terminal
- **WHEN** the user runs `ot add --done "Fixed the printer"`
- **THEN** the task is created completed, and `ot list --completed` shows it under today

#### Scenario: Win that repeats
- **WHEN** the user runs `ot add --done "Stretch" --repeat "every day"`
- **THEN** the command exits with a usage error and creates nothing
