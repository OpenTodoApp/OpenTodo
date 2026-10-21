# Spec Delta

## MODIFIED Requirements

### Requirement: Add and edit tasks
`ot add <title>` SHALL create a task with optional `--project`, `--due`, `--time`, `--priority 1..4`, repeatable `--label`, `--note`, `--repeat <rule>`, repeatable `--remind <phrase>` and `--origin-url <url>`, and print its id. `ot edit <ref>` SHALL change the same fields except `--remind`; `none` (or `--note ""`) clears one. `--due` SHALL accept `YYYY-MM-DD`, `today`, `tomorrow` and weekdays. `--repeat` SHALL send the canonical rule; `--remind` SHALL resolve a phrase like `30 min before` against the due date. `--origin-url` SHALL accept only an `http` or `https` URL, derive the provider and issue id for a recognised host on the client, and send the origin with the task; `ot list` and its siblings SHALL carry `origin` in `--json` output and print the origin's id or host as a column of the table when any listed task has one.

#### Scenario: Add with attributes
- **WHEN** the user runs `ot add "Call the plumber" --project Home --due tomorrow --time 09:00 --priority 2`
- **THEN** the created task has that title, project, tomorrow's date, time `09:00`, priority 2, and its id is printed

#### Scenario: Add from an issue
- **WHEN** the user runs `ot add "Fix the login timeout" --origin-url https://github.com/o/r/issues/7 --json`
- **THEN** the created task's origin is `{kind: "issue", provider: "github", id: "o/r#7", url: "https://github.com/o/r/issues/7"}`, the JSON output carries it, and no request went to that host

#### Scenario: Add from any page
- **WHEN** the user runs `ot add "Read this" --origin-url https://example.org/post`
- **THEN** the task's origin is `{kind: "url", url: "https://example.org/post"}`

#### Scenario: Unsafe origin URL
- **WHEN** `--origin-url ftp://files.example/x` is given
- **THEN** the command exits with code 2 before any request is sent

#### Scenario: Clear the origin
- **WHEN** the user runs `ot edit 8c2a --origin-url none`
- **THEN** the task's origin is removed and its other fields are kept

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
