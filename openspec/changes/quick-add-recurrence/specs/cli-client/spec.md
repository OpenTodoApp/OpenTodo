# Spec Delta

## ADDED Requirements

### Requirement: Natural-language line in `ot add`
`ot add --natural <line>` SHALL parse the line with the quick-add grammar (dates, times, `#project`, `@label`, priority, estimate, recurrence and reminders) and create the task from the result. The active languages SHALL be `--lang` (comma-separated codes), else the bundled language of the process locale, with English always active; numeric dates follow the first language's order and weeks start on Monday. For every line in the shared quick-add test vectors the result SHALL equal the web parser's. Without `--natural` the title is taken verbatim, as today.

#### Scenario: Line with a rule and a reminder
- **WHEN** the user runs `ot add --natural "Water plants every Monday remind me at 8 #home"` on Friday 2026-10-09 with a project named Home
- **THEN** the created task has title `Water plants`, project Home, due `2026-10-12`, rule `every monday`, and one relative reminder with offset −60 minutes, and the task id is printed

#### Scenario: German line
- **WHEN** the user runs `ot add --natural --lang de "Zahnarzt nächsten Mittwoch um 15 Uhr erinnere mich 30 Minuten vorher"`
- **THEN** the task is due next Wednesday at `15:00` with a relative reminder of −30 minutes and the title `Zahnarzt`

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

## MODIFIED Requirements

### Requirement: Add and edit tasks
`ot add <title>` SHALL create a task with optional `--project`, `--due`, `--time`, `--priority 1..4`, `--label` (repeatable), `--note`, `--repeat <rule>` and `--remind <phrase>` (repeatable), and SHALL print the new id. `ot edit <ref>` SHALL change the same fields except `--remind`, and SHALL clear a value with `--due none`, `--project none`, `--repeat none` or `--note ""`. `--due` SHALL accept `YYYY-MM-DD`, `today`, `tomorrow` and English weekday names resolved to the next occurrence. `--repeat` SHALL accept any spelling of the recurrence grammar and SHALL send its canonical form; `--remind` SHALL accept a reminder phrase without the reminder word (`30 min before`, `at 9`, `tomorrow at 9`), resolved against the task's due date like a quick-add reminder, and SHALL create the reminder after the task. Writes go through the REST API and therefore reach every device on its next sync.

#### Scenario: Add with attributes
- **WHEN** the user runs `ot add "Call the plumber" --project Home --due tomorrow --time 09:00 --priority 2`
- **THEN** the created task has that title, project, tomorrow's date, time `09:00`, priority 2, and its id is printed

#### Scenario: Invalid priority
- **WHEN** `--priority 7` is given
- **THEN** the command exits with code 2 before any request is sent

#### Scenario: Server rejects the write
- **WHEN** the server answers a write with an `invalid_input` error
- **THEN** the command exits with code 1 and prints the server's message verbatim

#### Scenario: Add with a rule and two reminders
- **WHEN** the user runs `ot add "Backup check" --due monday --time 09:00 --repeat "Every Week" --remind "30 min before" --remind "1 day before"`
- **THEN** the task is created with rule `every week` and two relative reminders with offsets −30 and −1440 minutes, in that order, and its id is printed

#### Scenario: Invalid rule rejected locally
- **WHEN** `--repeat "every blursday"` is given
- **THEN** the command exits with code 2 with the grammar's error message before any request is sent

#### Scenario: Clear the rule
- **WHEN** the user runs `ot edit 8c2a --repeat none` on a recurring task
- **THEN** the task's rule is cleared and its due date is kept

#### Scenario: Reminder phrase without a due date
- **WHEN** the user runs `ot add "Prepare slides" --remind "1 day before"`
- **THEN** the task is created and a relative reminder with offset −1440 minutes is created with no firing time, and the human output says it fires once the task has a due date

#### Scenario: Idempotent retry with reminders
- **WHEN** the user runs `ot add "Flight" --due 2026-11-03 --time 06:00 --remind "1 day before" --idempotency-key trip-flight --json` twice
- **THEN** both runs print the same task id and exactly one task and one reminder exist
