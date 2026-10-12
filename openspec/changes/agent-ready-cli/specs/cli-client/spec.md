## MODIFIED Requirements

### Requirement: JSON output and exit codes
Every command SHALL accept `--json` and then print only JSON on stdout, matching the documented schemas of `output_version` 1: the entity, array or bulk result on success, `{"error":{"code","message","exit"}}` on failure, plus one human line on stderr. Exit codes SHALL be 0 success, 1 server error, 2 usage, 3 authentication or configuration, 4 unreachable, 5 not permitted (`insufficient_scope`, `forbidden`, `not_permitted`, `writes_disabled_by_owner`, `writes_disabled_by_user`, `encryption_enabled`, `read_only`). Without a terminal, colour and prompts SHALL be off.

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

### Requirement: Complete, reopen and delete
`ot done <ref...>`, `ot reopen <ref...>` and `ot rm <ref...>` SHALL act on one or more tasks, a `<ref>` being a full id or a prefix matching exactly one non-deleted task. With `--json` each task SHALL be printed with the additive fields `ref` and `status` (`completed`, `reopened`, `deleted` or `unchanged`). A task already in the requested state SHALL be reported as `unchanged` without a write. `ot rm` SHALL soft-delete, SHALL ask on a terminal unless `--yes`, and without a terminal or with `--json` SHALL refuse without `--yes` (exit 2). Writes are online-only and converge like web edits.

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

## ADDED Requirements

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
