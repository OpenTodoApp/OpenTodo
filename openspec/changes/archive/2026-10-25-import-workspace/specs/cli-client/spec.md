## ADDED Requirements

### Requirement: Import command
`ot import <file>` SHALL upload the file to the server's importer and SHALL be a write command: without `--dry-run` it starts an import job, waits until the job is no longer running and prints its counts (with `--json`, the job); with `--dry-run` it sends only the preview, which writes nothing, and prints the planned import request with the detected format, totals and notes (with `--json`, the dry-run document with the server's preview under `preview`). `--format`, `--existing`, `--duplicates` and `--time-zone` SHALL map to the import options of the same meaning. The target workspace SHALL be the one chosen by `--workspace`, `OPENTODO_WORKSPACE` or the profile's workspace, resolved by name or id like every command; without any choice no workspace option is sent, so the server's default applies (the default workspace, or an own export's own mapping). Like every command it needs the server; an unreachable server exits 4. Read-only mode and read or agent tokens SHALL refuse the import before the file is sent (exit 5), and a server refusal exits 1 with the server's error code.

#### Scenario: Import into Work
- **WHEN** a user runs `ot import todoist.zip --workspace Work`
- **THEN** the job runs with Work as its workspace, the command prints how many items were created, skipped and failed, and exits 0 once the job is done

#### Scenario: Preview only
- **WHEN** a user runs `ot import tasks.csv --dry-run --json --workspace Work`
- **THEN** stdout is the dry-run document with one planned `POST /api/v1/import` naming Work and the preview's totals, nothing is written, and the exit code is 0

#### Scenario: Unknown workspace
- **WHEN** `--workspace` names a workspace the account does not belong to
- **THEN** the command exits 2 listing the available workspaces and sends no file

#### Scenario: Agent token
- **WHEN** the profile's token has the scope `agent`
- **THEN** `ot import` exits 5 with `insufficient_scope` and nothing is sent

#### Scenario: Missing file
- **WHEN** the named file does not exist
- **THEN** the command exits 2 naming the file
