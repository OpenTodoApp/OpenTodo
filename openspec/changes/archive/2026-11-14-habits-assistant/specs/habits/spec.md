## ADDED Requirements

### Requirement: Habit numbers on the server
The server SHALL compute a habit's scheduled dates, day states, kept, strength, streaks, at risk and back on track with the same rules as the devices, from the series, its lineage and its records and the user's logical today (their day start and time zone), pinned by the same test vectors, so the server, every device and every tool give identical numbers for the same rows. It SHALL need no content, so it works on end-to-end encrypted accounts. Numbers SHALL reflect only synced rows, and every answer that carries them SHALL carry the server time.

#### Scenario: Same numbers
- **WHEN** the shared habit vectors are run by the Go and the TypeScript code
- **THEN** every vector gives the same states and numbers on both sides

#### Scenario: Not yet synced
- **WHEN** a device checked in Run offline and has not synced
- **THEN** the server's numbers do not include that day until the device syncs

### Requirement: Habits route
`GET /api/v1/habits` SHALL list the user's open habits (graduated ones with `?graduated=true`) with the fields of `list_habits`; `GET /api/v1/habits/{id}` SHALL return one habit with its days for `from` and `to` as `get_habit` does. `POST /api/v1/habits/{id}/log` with `{date?, state, note?}` SHALL behave as `log_habit` and answer the updated habit, through the op log, so scripts and shortcuts can log a habit without knowing about occurrence records. The routes SHALL require a signed-in session or a token: `read` tokens only on `GET`, `agent` tokens only while assistant writes are allowed. They SHALL answer 401 without credentials, 403 `insufficient_scope` for a `read` token on `POST`, 404 `not_found` for an id the user cannot see, 400 `not_a_habit` for a task that is not a habit, and 400 `invalid_input` for a missing or unknown state, a date after today or a date before the lineage's first scheduled date.

#### Scenario: A phone shortcut logs water
- **WHEN** a shortcut posts `{"state": "done"}` to the log route of Water with a `full` token
- **THEN** today's record is done, the series moves on, and the answer carries the new kept and strength

#### Scenario: Not signed in
- **WHEN** the log route is called without a session or token
- **THEN** it answers 401 and nothing is written

#### Scenario: Read token writes
- **WHEN** a `read` token posts to the log route
- **THEN** it answers 403 `insufficient_scope` and nothing is written

#### Scenario: Bad state
- **WHEN** a client posts `{"state": "maybe"}`
- **THEN** it answers 400 `invalid_input` naming `state`, and nothing is written

### Requirement: Habits in the CLI
`ot habits` SHALL list habits with kept and strength, `ot habits show <id|title>` SHALL print one habit's last 31 days, and `ot habits log <id|title> [--date D] [--tiny|--skip|--clear] [--note text]` SHALL log through the habits route, each with `--json`.

#### Scenario: Log from the terminal
- **WHEN** the user runs `ot habits log Run --note "5k"`
- **THEN** today's Run is done with that note and the command prints the new kept and strength

## MODIFIED Requirements

### Requirement: Integrations complete a habit like any task
Completing a habit through the REST API, CalDAV or an assistant tool SHALL record a done occurrence and move the series exactly as for any recurring task, without knowing about habits. The REST API SHALL accept and return `habit`, `habit_tiny` and `habit_anchor` as task fields; assistant tool results SHALL carry `habit: true` for a habit. Skipping, logging the tiny version and editing a past day SHALL be possible through the habits route, the CLI, MCP's `log_habit` and routines, always as the app does them; CalDAV SHALL only complete.

#### Scenario: Completed through the API
- **WHEN** a script patches a habit's `completed_at` through `/api/v1/tasks/{id}`
- **THEN** the day is recorded as done, the series moves on, and the device's streak counts it after sync

#### Scenario: Invalid flag value
- **WHEN** a client submits `"habit": "yes"` through the API or the sync endpoint
- **THEN** the write is rejected as invalid and the task is unchanged

#### Scenario: Skip through the API
- **WHEN** a script posts `{"state": "skipped"}` to the log route of Read
- **THEN** today's record is skipped, the series moves on, and the streak is unbroken
