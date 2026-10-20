# Spec Delta

## ADDED Requirements

### Requirement: Issue connection commands
`ot issues list` SHALL print the signed-in account's issue connections (OpenSpec `issue-connections`) with id, name, provider, host, state, last poll and task count, never a token, as a table or with `--json`. `ot issues sync [<id>]` SHALL run one poll now for the named connection, or every enabled connection of the account, and print the counts of tasks created, completed, reopened and renamed. Both SHALL appear in `ot schema` and `ot help --json`.

#### Scenario: List without secrets
- **WHEN** the user runs `ot issues list --json`
- **THEN** the output lists each connection with `token_set: true` and no token value

#### Scenario: Sync one connection
- **WHEN** the user runs `ot issues sync 7f3a`
- **THEN** the poll runs, the command prints `created 3, completed 1, reopened 0, renamed 2` and exits 0

#### Scenario: Help and schema list the commands
- **WHEN** an agent runs `ot schema` without a profile
- **THEN** the JSON lists `issues list` and `issues sync` with `writes: true` and `dry_run: true` on `sync`

### Requirement: Issue sync is a write command
`ot issues sync` SHALL support `--dry-run`, SHALL be refused in read-only mode and with a `read` or `agent` token before any poll runs, and SHALL exit non-zero with the server's message when the feature is off, the connection is stopped or the rate limit is reached.

#### Scenario: Feature off
- **WHEN** the owner has not enabled issue connections and the user runs `ot issues sync`
- **THEN** the command exits non-zero with a message saying the owner has not enabled issue connections

#### Scenario: Dry run
- **WHEN** the user runs `ot issues sync 7f3a --dry-run`
- **THEN** the request that would be sent is printed and no poll runs

#### Scenario: Read-only mode
- **WHEN** the user runs `ot issues sync` with `--read-only`
- **THEN** the command exits with code 5 (`read_only`, as for every write command) before any request is sent
