## ADDED Requirements

### Requirement: Published compatibility policy
The repository SHALL publish `docs/stability.md`, linked from `docs/api.md`, `docs/sync.md`, `docs/mcp.md`, `docs/cli.md`, `docs/import-export.md` and the README. It SHALL name the v1 surface (every route under `/api/v1/` with its request fields, response fields and documented statuses; the error codes; the sync protocol and op schema; the export format `opentodo-export` version 1; the MCP tool names, arguments and result fields; the `ot` commands, flags, exit codes and `--json` output), SHALL list the changes allowed within a major version (only additions: new routes, optional request fields, response fields, error codes for new conditions, op entities and fields, values of enums documented as open, MCP tools and optional arguments, CLI commands and flags, export keys) and the changes that need a new major version (removal, rename, type or unit change, a field becoming required, a documented condition changing status or code, narrowed accepted values, changed meaning), SHALL state that clients must ignore unknown fields and unknown values of open enums, and SHALL state semantic versioning for releases and image tags. The docs check SHALL fail when any of the linking pages lacks the link.

#### Scenario: Integrator reads the policy
- **WHEN** a developer opens `docs/api.md`
- **THEN** it links to `docs/stability.md`, which lists the v1 surface, the allowed additive changes, the forbidden changes and the deprecation window

#### Scenario: Missing link
- **WHEN** a change removes the stability link from `docs/mcp.md`
- **THEN** `make docs-check` fails naming the page

### Requirement: The v1 surface only grows
The repository SHALL keep a snapshot of the v1 surface in `internal/httpapi/testdata/v1_surface.json` covering routes with their policy, request and response fields, error codes with their statuses, op entities and fields with value types, export keys and version, MCP tools with argument and result fields, and CLI commands with flags, `--json` fields and exit codes. A Go test SHALL build the current surface and SHALL fail when an entry of the snapshot is missing, when a type, status, policy or exit code differs, or when a current entry is not in the snapshot. Its update mode SHALL only add entries. After the `v1.0.0` tag exists, the repository checks SHALL fail when an entry of the snapshot at that tag is missing from the current snapshot.

#### Scenario: A response field is renamed
- **WHEN** a change renames `completed_at` to `done_at` in the task representation
- **THEN** the surface test fails naming `GET /api/v1/tasks/{id}` and the missing field `completed_at`

#### Scenario: A route is added
- **WHEN** a change adds `GET /api/v1/objectives` and does not regenerate the snapshot
- **THEN** the surface test fails and tells the contributor to run it with `-update`, after which it passes and the snapshot gains the route

#### Scenario: An entry is deleted from the snapshot by hand
- **WHEN** a change deletes the `bad_request` error code from both the server and the snapshot after `v1.0.0` was tagged
- **THEN** the repository check fails naming `bad_request` as present at `v1.0.0` and missing now

#### Scenario: An optional request field becomes required
- **WHEN** a change makes `project_id` required on `POST /api/v1/tasks`
- **THEN** the surface test fails naming the route and the field whose requirement changed

### Requirement: Deprecation before removal
A deprecated v1 route SHALL keep its behaviour, SHALL answer with a `Deprecation` header (RFC 9745) and a `Sunset` header (RFC 8594) no earlier than 12 months and two minor releases after the release that deprecated it, and SHALL be marked in `docs/api.md` with its replacement. A v1 route SHALL NOT be removed while `/api/v1/` is served; removal SHALL happen only by serving a new major path. Op schema fields SHALL never be removed, and the server SHALL accept and serve every op field of the snapshot for as long as it runs version 1 of the sync protocol.

#### Scenario: Calling a deprecated route
- **WHEN** a client calls a route deprecated in 1.3.0
- **THEN** the response is the route's normal answer and carries `Deprecation` and a `Sunset` date at least 12 months after the 1.3.0 release date

#### Scenario: Old op field in a sync push
- **WHEN** a 1.0 client pushes an op on a field that a later 1.x release deprecated in favour of another
- **THEN** the server applies the op as before and returns it to other devices

### Requirement: Upgrade from every released version
The server SHALL upgrade a data directory written by any released 0.x version from 0.1.0 on, and by any earlier 1.x version, directly to the current version without an intermediate release. The repository SHALL keep one compressed fixture data directory per released minor version under `internal/store/testdata/upgrade/`, built from that version's published image by a documented script, each with a manifest of expected counts. A Go test in the server CI job SHALL open every fixture, run the migrations, and fail unless the migrations complete, the counts of tasks, projects, sections, labels, comments, time entries, attachments, members and ops match the manifest, a sync pull from cursor 0 returns every op, the export validates, the owner signs in with the fixture password and the fixture API token authenticates. The release preparation SHALL refuse a new minor release without a fixture for it. Migrated data SHALL converge like any other data: devices that synced before the upgrade continue from their cursor without a full resync.

#### Scenario: Upgrade from 0.4
- **WHEN** the upgrade test opens the 0.4 fixture
- **THEN** every migration runs, the manifest counts match, the pulled ops cover every task and the owner signs in

#### Scenario: A migration loses rows
- **WHEN** a change adds a migration that drops tasks without a section
- **THEN** the upgrade test fails naming the fixtures whose task count no longer matches

#### Scenario: Releasing a minor without its fixture
- **WHEN** a maintainer runs `make release-prepare VERSION=1.2.0` and no `upgrade/1.2` fixture exists
- **THEN** the command fails and names the script that builds it

#### Scenario: Device synced before the upgrade
- **WHEN** a phone that pulled up to cursor N before the server upgrade syncs after it
- **THEN** it receives only the ops after N and its local data matches the server's

### Requirement: Older clients keep working within the major version
A 1.x server SHALL answer requests from any 1.x client (the web app, the Android and iOS shells, `ot`, the browser extension, plugins) with responses that contain every field the client's version received, with the same types. The repository SHALL keep request and response pairs recorded from the 1.0 clients and SHALL replay them against the current server in CI, failing when a recorded response field is missing or changed type; additional fields SHALL pass.

#### Scenario: A 1.0 shell syncs with a 1.4 server
- **WHEN** the recorded 1.0 sync request is replayed against the current server
- **THEN** the response carries every field of the recorded response with the same types and the test passes even though new fields are present

#### Scenario: A field the 1.0 client needs disappears
- **WHEN** a change stops sending `cursor` in sync responses
- **THEN** the client replay test fails naming the recorded pair and the field

### Requirement: Export format guarantee
Every 1.x server SHALL write exports with `"format":"opentodo-export"` and `"version":1`, and SHALL import every version 1 export written by any 0.x or 1.x release. CI SHALL import committed exports written by 0.16 and 1.0 and SHALL fail unless every project, section, label, task, comment, time entry and workspace of the file arrives through the operation log.

#### Scenario: Importing a 0.16 export into 1.x
- **WHEN** the import test loads the 0.16 export fixture into an empty account
- **THEN** every entity of the file is present after the import job and the counts match the file

#### Scenario: Export version changes by accident
- **WHEN** a change writes `"version":2` without a new major release
- **THEN** the export test and the surface test fail
