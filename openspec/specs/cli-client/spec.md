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
`ot add <title>` SHALL create a task with optional `--project`, `--due`, `--time`, `--priority 1..4`, `--label` (repeatable) and `--note`, and SHALL print the new id. `ot edit <ref>` SHALL change the same fields and SHALL clear a value with `--due none`, `--project none` or `--note ""`. `--due` SHALL accept `YYYY-MM-DD`, `today`, `tomorrow` and English weekday names resolved to the next occurrence. Writes go through the REST API and therefore reach every device on its next sync.

#### Scenario: Add with attributes
- **WHEN** the user runs `ot add "Call the plumber" --project Home --due tomorrow --time 09:00 --priority 2`
- **THEN** the created task has that title, project, tomorrow's date, time `09:00`, priority 2, and its id is printed

#### Scenario: Invalid priority
- **WHEN** `--priority 7` is given
- **THEN** the command exits with code 2 before any request is sent

#### Scenario: Server rejects the write
- **WHEN** the server answers a write with an `invalid_input` error
- **THEN** the command exits with code 1 and prints the server's message verbatim

### Requirement: Complete, reopen and delete
`ot done <ref...>`, `ot reopen <ref...>` and `ot rm <ref...>` SHALL act on one or more tasks. A `<ref>` SHALL be a full id or an id prefix that matches exactly one non-deleted task. `ot rm` SHALL soft-delete and SHALL ask for confirmation on a terminal unless `--yes` is given.

#### Scenario: Prefix reference
- **WHEN** exactly one open task id starts with `8c2a` and the user runs `ot done 8c2a`
- **THEN** that task gets a completion time and the command exits 0

#### Scenario: Ambiguous prefix
- **WHEN** two tasks share the given prefix
- **THEN** nothing changes, the command exits with code 2 and shows both candidates

### Requirement: Project and token commands
`ot project list|add|rename|archive|rm` SHALL manage projects and `ot token list|create|revoke` SHALL manage API tokens of the signed-in account, with the same output conventions as task commands. `ot token create` SHALL print the secret exactly once. `ot export` SHALL write the server's JSON export to stdout or to `--out <file>`.

#### Scenario: Create a project
- **WHEN** the user runs `ot project add "Garden"`
- **THEN** the project exists on the server and appears in the web app's sidebar after its next sync

#### Scenario: Token secret shown once
- **WHEN** the user runs `ot token create backup-script`
- **THEN** the secret is printed with a notice that it will not be shown again

### Requirement: JSON output and exit codes
Every command SHALL accept `--json` and then print only JSON: the API entity or array for reads and writes, `{"error":{"code","message"}}` on failure. Exit codes SHALL be 0 success, 1 server-side error, 2 usage or local validation error, 3 authentication or configuration error, 4 server unreachable. When stdout is not a terminal, colour and prompts SHALL be disabled.

#### Scenario: Script consumption
- **WHEN** a script runs `ot list --json --today`
- **THEN** stdout is a JSON array of task objects with the same field names as the REST API and nothing else

#### Scenario: Error as JSON
- **WHEN** `--json` is given and the server returns an error envelope
- **THEN** stdout contains that envelope unchanged and the exit code is 1

### Requirement: Online-only client
The client SHALL hold no local copy of tasks and SHALL make no changes when the server cannot be reached; it SHALL fail fast with exit code 4 and a message naming the server URL. Because every write goes through the REST API, which records operations in the log, changes made with the client converge on all devices under the same last-writer-wins rule as web edits, and a network failure never leaves a half-applied change.

#### Scenario: Server down
- **WHEN** the server does not answer within the timeout
- **THEN** the command exits with code 4, names the URL and suggests checking connectivity

#### Scenario: Concurrent edit converges
- **WHEN** the client changes a task's priority while a phone changes its title offline, and the phone later syncs
- **THEN** every device shows both the new priority and the new title
