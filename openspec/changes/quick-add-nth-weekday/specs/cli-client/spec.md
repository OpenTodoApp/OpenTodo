# Spec Delta

## MODIFIED Requirements

### Requirement: Natural-language line in `ot add`
`ot add --natural <line>` SHALL parse the line with the quick-add grammar (dates, times, ordinal weekdays, `#project`, `@label`, priority, estimate, recurrence, reminders) and create the task and its reminders from the result. Languages come from `--lang`, else the process locale, with English always active; numeric dates follow the first language and weeks start on Monday. For every line in the shared quick-add vectors the result SHALL equal the web parser's. Without `--natural` the title is taken verbatim.

#### Scenario: Line with a rule and a reminder
- **WHEN** the user runs `ot add --natural "Water plants every Monday remind me at 8 #home"` on Friday 2026-10-09 with a project named Home
- **THEN** the created task has title `Water plants`, project Home, due `2026-10-12`, rule `every monday`, and one relative reminder with offset −60 minutes, and the task id is printed

#### Scenario: German line
- **WHEN** the user runs `ot add --natural --lang de "Zahnarzt nächsten Mittwoch um 15 Uhr erinnere mich 30 Minuten vorher"`
- **THEN** the task is due next Wednesday at `15:00` with a relative reminder of −30 minutes and the title `Zahnarzt`

#### Scenario: Ordinal weekday line
- **WHEN** the user runs `ot add --natural "Board every 2nd Tuesday of the month at 10:00"` on Saturday 2026-10-10
- **THEN** the created task has title `Board`, rule `every 2nd tuesday`, due `{date: "2026-10-13", time: "10:00"}`, and the task id is printed

#### Scenario: Dry run shows every request
- **WHEN** the user runs `ot add --natural "Flight 3 Nov at 06:00 remind me 1 day before" --dry-run --json`
- **THEN** stdout lists a planned `POST /api/v1/tasks` and a planned `POST /api/v1/reminders` whose `task_id` is the planned task's placeholder, nothing is created, and the exit code is 0

#### Scenario: Unknown project token stays in the title
- **WHEN** the user runs `ot add --natural "Read #nosuch tomorrow"` and no project matches `nosuch`
- **THEN** the task is created in the Inbox with title `Read #nosuch`, due tomorrow, and no error

#### Scenario: Reminder request fails after the task was created
- **WHEN** the server accepts the task but answers the reminder request with an error
- **THEN** the command prints the server's message, names the created task id so the user can add the reminder by hand, and exits with code 1

#### Scenario: Read token
- **WHEN** the stored token has scope `read` and the user runs `ot add --natural "Call mum remind me at 9"`
- **THEN** no request is sent, the exit code is 5 and the error code is `insufficient_scope`
