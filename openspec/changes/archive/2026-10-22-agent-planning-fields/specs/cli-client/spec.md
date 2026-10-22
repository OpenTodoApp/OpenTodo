## MODIFIED Requirements

### Requirement: Add and edit tasks
`ot add <title>` SHALL create a task with optional `--project`, `--due`, `--time`, `--priority 1..4`, repeatable `--label`, `--note`, `--repeat <rule>`, repeatable `--remind <phrase>`, `--origin-url <url>`, `--deadline <date>`, `--start <date|someday>`, `--evening`, repeatable `--blocked-by <ref>` and `--location <where>`, and print its id. `ot edit <ref>` SHALL change the same fields except `--remind`; `none` (or `--note ""`, `--evening=false`) clears one, and `--blocked-by` on edit replaces the whole list. `--due`, `--deadline` and `--start` SHALL accept `YYYY-MM-DD`, `today`, `tomorrow` and weekdays, `--start` also `someday`; a value that is not one of these SHALL exit with code 2 before any request. `--blocked-by` SHALL take a task id or an unambiguous id prefix of a task the account can see and send the resolved ids; `--location` SHALL take the name or id of one of the account's saved locations (sent as a link to it with its current values), a `lat,lon` pair (sent as coordinates), or `none`, and an unknown name SHALL exit with code 1 naming it before the task is written. `--repeat` SHALL send the canonical rule; `--remind` SHALL resolve a phrase like `30 min before` against the due date. `--origin-url` SHALL accept only an `http` or `https` URL, derive the provider and issue id for a recognised host on the client, and send the origin with the task; `ot list` and its siblings SHALL carry `origin` in `--json` output and print the origin's id or host as a column of the table when any listed task has one.

#### Scenario: Add with attributes
- **WHEN** the user runs `ot add "Call the plumber" --project Home --due tomorrow --time 09:00 --priority 2`
- **THEN** the created task has that title, project, tomorrow's date, time `09:00`, priority 2, and its id is printed

#### Scenario: Add with a start and a deadline
- **WHEN** the user runs `ot add "Quarterly report" --start monday --deadline 2026-11-06 --json`
- **THEN** the created task has `start` set to next Monday's date, `deadline: "2026-11-06"`, no due date, and the JSON output carries both

#### Scenario: Park in Someday from a script
- **WHEN** the user runs `ot edit 8c2a --start someday`
- **THEN** the task's `start` is `someday`, its due date is kept as stored, and the human output says it was parked

#### Scenario: Evening and its clearing
- **WHEN** the user runs `ot edit 8c2a --evening` and later `ot edit 8c2a --evening=false`
- **THEN** the task's `evening` is true after the first command and false after the second, with no other field changed

#### Scenario: Waiting for another task
- **WHEN** the user runs `ot add "Install shelves" --project Home --blocked-by 91f0` and `91f0` is the prefix of exactly one open task in Home
- **THEN** the created task's `blocked_by` holds that task's id and `ot list --blocked` lists it

#### Scenario: Ambiguous blocker prefix
- **WHEN** `--blocked-by 9` matches several tasks
- **THEN** the command exits with code 1 listing the candidates and sends no write

#### Scenario: Location by saved location
- **WHEN** the user runs `ot edit 8c2a --location Gym` and Gym is one of the account's saved locations
- **THEN** the task's location is written as a link to Gym with its current name, address and coordinates, and `ot edit 8c2a --location none` removes it

#### Scenario: Location by coordinates
- **WHEN** the user runs `ot add "Meet the plumber" --location 45.4642,9.1900`
- **THEN** the created task's location holds those coordinates and no name or address

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

#### Scenario: Invalid start word
- **WHEN** `--start later` or `--deadline 2026-02-30` is given
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

#### Scenario: Agent token writes planning fields
- **WHEN** the stored token has scope `agent`, both assistant switches are on, and the user runs `ot edit 8c2a --start someday --deadline 2026-11-06`
- **THEN** the write succeeds through the agent content routes, is attributed to the assistant in the task's history, and is recorded as `agent.write`

## ADDED Requirements

### Requirement: Planning fields in list output
`ot list` and its siblings SHALL accept `--someday` (open tasks parked in Someday), `--anytime` (open tasks neither scheduled nor parked) and `--blocked` (open tasks waiting for an open task), evaluated on the client from the task fields with the same rules as the app's views, combinable with `--project` and `--limit`. The human table SHALL add a `BY` column with the deadline when any listed task has one, mark a deadline that has passed like an overdue date, and append `(someday)`, `starts <date>`, `evening` and `waiting` to the `DUE` cell when they apply; `--json` output SHALL carry `deadline`, `start`, `evening`, `blocked_by` and `location` on every task, and the `task` schema of `ot schema` SHALL describe them within output version 1.

#### Scenario: Someday list
- **WHEN** the user runs `ot list --someday`
- **THEN** only open tasks with `start: "someday"` are printed, each marked `(someday)` in the table

#### Scenario: Deadline column
- **WHEN** one of the listed tasks has a deadline of 2026-11-06
- **THEN** the table has a `BY` column showing `2026-11-06` on that row and blank on the others, and a deadline earlier than today is marked overdue

#### Scenario: Schema describes the fields
- **WHEN** an agent runs `ot schema --json` on a machine with no profile and no network
- **THEN** the `task` schema lists `deadline`, `start`, `evening`, `blocked_by` and `location` with their types, and the `add` and `edit` commands list the new flags

#### Scenario: Skill file names the flags
- **WHEN** an agent runs `ot skill`
- **THEN** the text tells it to use `--start`, `--deadline`, `--evening` and `--blocked-by` for planning instead of forcing a due date on every task, and names `--location`
