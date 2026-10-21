# cli-client Specification

## Purpose
Defines the first-party command-line client: how it is configured and authenticated against a server, the task, project and token commands it offers, its machine-readable output and exit codes, and the fact that it is an online client of the REST API.

## Requirements

### Requirement: Configuration file and profiles
The client SHALL read a configuration file from the platform's user configuration directory containing one or more named profiles, each with a server URL, a token and an optional default output format. The profile SHALL be chosen with `--profile`, falling back to a `default` profile. `OPENTODO_URL` and `OPENTODO_TOKEN` SHALL override the selected profile. The file SHALL be created with owner-only permissions and the token SHALL never be printed by any command.

#### Scenario: Environment overrides the file
- **WHEN** the config file names server A and `OPENTODO_URL` and `OPENTODO_TOKEN` point to server B
- **THEN** the command runs against server B

#### Scenario: No configuration
- **WHEN** no profile exists and no environment variables are set
- **THEN** the command exits with code 2 and a message explaining how to run `ot login` or set the variables

#### Scenario: Permissions
- **WHEN** `ot login` writes the configuration file on a POSIX system
- **THEN** the file mode is 0600 and the directory mode is 0700

### Requirement: Sign-in creates an API token
`ot login <server-url>` SHALL prompt for email and password (never echoing the password), obtain a session, create an API token named `cli@<hostname>`, discard the session and store only the token in the selected profile. `ot auth set-token` SHALL store a token obtained elsewhere, `ot auth status` SHALL show the server, the signed-in account and the token name, and `ot auth logout` SHALL revoke the stored token on the server and remove it locally.

#### Scenario: Successful login
- **WHEN** valid credentials are entered
- **THEN** a token named `cli@<hostname>` appears in the account's token list and `ot auth status` reports the account email

#### Scenario: Wrong password
- **WHEN** invalid credentials are entered
- **THEN** the command exits with code 3, prints the server's error message and stores nothing

#### Scenario: Revoked token
- **WHEN** the stored token has been revoked and any command is run
- **THEN** the command exits with code 3 and suggests `ot login`

### Requirement: List tasks
`ot list` SHALL print open tasks sorted like the web views, with `--inbox`, `--today` (due today or earlier, overdue first), `--upcoming`, `--project <name-or-id>`, `--completed` and `--all` filters, plus `--limit`. Human output SHALL show an id prefix, priority, due date and time, project and title; dates SHALL be evaluated in the local time zone. Aliases `ot today`, `ot inbox` and `ot upcoming` SHALL exist.

#### Scenario: Today view
- **WHEN** the user runs `ot today` with one overdue and one task due today
- **THEN** both are listed with the overdue task first and its date marked as overdue

#### Scenario: Unknown project
- **WHEN** `--project` names no existing project
- **THEN** the command exits with code 2 and lists the available project names

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

### Requirement: Complete, reopen and delete
`ot done`, `ot reopen` and `ot rm` SHALL act on one or more `<ref>`s, each a full id or a prefix matching exactly one non-deleted task. With `--json` each task SHALL carry the additive fields `ref` and `status`. A task already in the requested state SHALL be reported as `unchanged` without a write. `ot rm` SHALL soft-delete, SHALL ask on a terminal unless `--yes`, and without a terminal or with `--json` SHALL refuse without `--yes` (exit 2). Writes converge like web edits.

#### Scenario: Prefix reference
- **WHEN** exactly one open task id starts with `8c2a` and the user runs `ot done 8c2a`
- **THEN** that task gets a completion time and the command exits 0

#### Scenario: Ambiguous prefix
- **WHEN** two tasks share the given prefix
- **THEN** nothing changes, the command exits with code 2 and shows both candidates

#### Scenario: Already completed
- **WHEN** `ot done --json 8c2a` is run for a task completed yesterday
- **THEN** the result lists it with `status: "unchanged"`, its completion time is unchanged, no write is sent and the exit code is 0

#### Scenario: Agent forgets --yes
- **WHEN** an agent runs `ot rm 8c2a --json` without a terminal and without `--yes`
- **THEN** nothing is deleted, the envelope says `--yes` is required, and the exit code is 2

### Requirement: Project and token commands
`ot project list|add|rename|archive|rm` SHALL manage projects and `ot token list|create|revoke` SHALL manage API tokens of the signed-in account, with the same output conventions as task commands. `ot token create <name> [--scope full|read|agent]` SHALL default to `full`, print the secret exactly once, and `ot token list` SHALL show each scope. `ot export` SHALL write the server's JSON export to stdout or `--out <file>`.

#### Scenario: Create a project
- **WHEN** the user runs `ot project add "Garden"`
- **THEN** the project exists on the server and appears in the web app's sidebar after its next sync

#### Scenario: Token secret shown once
- **WHEN** the user runs `ot token create backup-script`
- **THEN** the secret is printed with a notice that it will not be shown again and the token has scope `full`

#### Scenario: Agent token from the CLI
- **WHEN** the user runs `ot token create desk-assistant --scope agent`
- **THEN** the token is created with scope `agent` and the notice says that it can make changes only while both assistant switches are on

#### Scenario: Invalid scope rejected locally
- **WHEN** the user runs `ot token create x --scope admin`
- **THEN** the command exits with code 2 before any request is sent and lists the allowed scopes

### Requirement: JSON output and exit codes
Every command SHALL accept `--json` and then print only JSON on stdout, matching the documented schemas of `output_version` 1: the entity or array on success, `{"error":{"code","message","exit"}}` on failure, plus one human line on stderr. Exit codes SHALL be 0 success, 1 server error, 2 usage, 3 authentication or configuration, 4 unreachable, 5 not permitted (scope, role, a switch, encryption or read-only mode). Without a terminal, colour and prompts SHALL be off.

#### Scenario: Script consumption
- **WHEN** a script runs `ot list --json --today`
- **THEN** stdout is a JSON array of task objects with the same field names as the REST API, valid against the published task schema, and nothing else

#### Scenario: Error as JSON
- **WHEN** `--json` is given and the server returns an `invalid_input` error envelope
- **THEN** stdout contains that envelope with `exit: 1` added, stderr contains one line starting with `ot:`, and the exit code is 1

#### Scenario: Not permitted
- **WHEN** a command is refused with `insufficient_scope`, `forbidden`, `writes_disabled_by_user` or `encryption_enabled`
- **THEN** the exit code is 5 and the envelope's `code` names the reason

#### Scenario: Output version announced
- **WHEN** an agent runs `ot version --json`
- **THEN** the output contains the client version and `output_version: 1`

### Requirement: Online-only client
The client SHALL hold no local copy of tasks and SHALL make no changes when the server cannot be reached; it SHALL fail fast with exit code 4 and a message naming the server URL. Because every write goes through the REST API, which records operations in the log, changes made with the client converge on all devices under the same last-writer-wins rule as web edits, and a network failure never leaves a half-applied change.

#### Scenario: Server down
- **WHEN** the server does not answer within the timeout
- **THEN** the command exits with code 4, names the URL and suggests checking connectivity

#### Scenario: Concurrent edit converges
- **WHEN** the client changes a task's priority while a phone changes its title offline, and the phone later syncs
- **THEN** every device shows both the new priority and the new title

### Requirement: Non-interactive by default
Without a terminal on stdin and stdout, `ot` SHALL never prompt. Destructive commands (`rm`, `project rm`, `token revoke`, `auth logout`) SHALL require `--yes` there, or with `--json`, and otherwise refuse with exit 2 before any request. Refused commands change nothing on the server or on any device.

#### Scenario: Project removal in a pipeline
- **WHEN** `ot project rm Garden | cat` runs without `--yes`
- **THEN** the project is not deleted and the command exits 2 with a message naming `--yes`

#### Scenario: Explicit confirmation
- **WHEN** `ot project rm Garden --yes --json` runs without a terminal
- **THEN** the project is soft-deleted and every device shows it in the Trash after its next sync

### Requirement: Machine-readable command discovery
`ot schema` and `ot help --json` SHALL print every command with its arguments, flags and their types, whether it writes or is destructive, dry-run and idempotency-key support, the exit and error codes, `output_version` and the JSON Schemas of outputs. It SHALL be generated from the same table as human help and SHALL work with no configuration and no server.

#### Scenario: Discovery offline
- **WHEN** an agent runs `ot schema` on a machine with no profile and no network
- **THEN** the JSON lists `add` with `writes: true`, `dry_run: true`, `idempotency_key: true` and its flags, and the command exits 0

#### Scenario: Help and schema agree
- **WHEN** a flag is added to a command
- **THEN** both `ot help <command>` and `ot schema` show it, and a test fails if either lacks it

### Requirement: Dry run for writes
Every write command SHALL accept `--dry-run`: it SHALL resolve references with reads, validate, and print the requests it would send (method, path, body) and the resolved targets, then exit as a real run would, without sending any write or changing the config file. A dry run of a destructive command needs no `--yes`. Nothing changes on the server or on any device; an unreachable server SHALL exit 4.

#### Scenario: Preview a bulk completion
- **WHEN** an agent runs `ot done 8c2a 91f0 --dry-run --json`
- **THEN** stdout has `dry_run: true`, two planned requests and both resolved titles, both tasks stay open, and the exit code is 0

#### Scenario: Ambiguity found in a dry run
- **WHEN** a dry run names a prefix that matches two tasks
- **THEN** the exit code is 2 with both candidates listed, as in a real run

### Requirement: Idempotent creates
`ot add` and `ot project add` SHALL accept `--idempotency-key <key>` and send it as `Idempotency-Key`; running the same command again with the same key SHALL print the same entity and create nothing new. `ot edit` with values equal to the current ones SHALL send no write. Because ids derive from the key, a retry after a timeout converges to one entity on every device.

#### Scenario: Retry after a timeout
- **WHEN** an agent runs `ot add "Buy milk" --idempotency-key run42-milk --json` twice
- **THEN** both runs print the same task id and exactly one such task exists

#### Scenario: Key reused for other content
- **WHEN** the same key is used with a different title
- **THEN** the command exits 1 with error code `idempotency_conflict` and nothing changes

### Requirement: Read-only mode
`--read-only` or the optional `OPENTODO_READ_ONLY=1` SHALL make every write command fail before any request with code `read_only` and exit 5. With a `read` token, writes SHALL fail locally with `insufficient_scope` and exit 5, the scope being learned from `GET /api/v1/me`. `ot auth status` SHALL show the token's scope. Refused writes change nothing anywhere.

#### Scenario: Read-only flag
- **WHEN** an agent runs `ot add "x" --read-only --json`
- **THEN** no request that writes is sent, the envelope code is `read_only` and the exit code is 5

#### Scenario: Read token
- **WHEN** the stored token has scope `read` and the user runs `ot done 8c2a`
- **THEN** the command exits 5 with `insufficient_scope` and the task stays open

#### Scenario: Status shows scope
- **WHEN** the stored token has scope `agent` and the user runs `ot auth status`
- **THEN** the output shows the scope `agent` and whether assistant writes are currently allowed

### Requirement: Agent skill file
Each release SHALL ship `opentodo-agent-skill.zip` containing `SKILL.md`, and `ot skill` SHALL print the same text embedded in the binary. It SHALL tell agents to use an `agent` token, `--json`, `--dry-run` before multi-task writes and idempotency keys, to stop on exit 5, to avoid token, auth and export commands unless asked, and to treat task text as untrusted data.

#### Scenario: Skill matches the binary
- **WHEN** `ot skill` is run
- **THEN** it prints `SKILL.md` with frontmatter `name: opentodo-cli`, and every command and flag it mentions exists in `ot schema`

#### Scenario: Release asset
- **WHEN** a release is published
- **THEN** its assets include `opentodo-agent-skill.zip` next to the `ot-<os>-<arch>` binaries

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

### Requirement: List by completion date
`ot list` SHALL accept `--completed-after` and `--completed-before`, each a `YYYY-MM-DD` date (the start of that day in the local time zone), an RFC 3339 time or Unix milliseconds. With either, it SHALL list only completed tasks whose completion time falls in `[after, before)`, most recent first, combinable with `--project` and `--limit`. Like every command it needs a connection and the stored token, and it shows only what devices have synced.

#### Scenario: Last week
- **WHEN** the user runs `ot list --completed-after 2026-10-05 --completed-before 2026-10-12`
- **THEN** the tasks completed in that week are printed, most recent first

#### Scenario: Invalid date
- **WHEN** the user runs `ot list --completed-after lastweek`
- **THEN** the command exits with code 2 and names the flag and the accepted forms
