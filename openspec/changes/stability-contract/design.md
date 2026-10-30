# Design

## Context

- Routes are registered in one place, `routes.handle(pattern, policy, handler)` (`internal/httpapi/policy.go`), and `policy_test.go` already walks the registry. That makes the route list enumerable from a test.
- Error codes the client knows are listed in `web/src/lib/i18n/server-error-codes.json`.
- The op schema is pinned by `internal/sync/testdata/schema_fixture.json`, read by Go and TS tests (`docs/contracts.md`).
- The MCP server serves tools from the `internal/agenttools` registry; the CLI command tree is in `internal/cli`.
- Migrations are embedded (`internal/store/migrations/NNNN_*.sql`, applied by `PRAGMA user_version`); `self-hosting` "Schema migrations" upgrades on start. Nothing tests an upgrade from a database written by an old release.
- 22 `v0.*` tags exist (0.1.0 … 0.16.0 with patches). Images are published on GHCR for each release.

## Decisions

**D1. One snapshot file describes the v1 surface; the test allows only additions.**
`internal/httpapi/testdata/v1_surface.json` holds, sorted:

| Section | Entry | Source |
|---|---|---|
| `routes` | `"GET /api/v1/tasks/{id}"` → policy name, documented request fields and response fields | route registry + the request/response structs named in each handler's doc table |
| `errors` | code → HTTP status | `server-error-codes.json` and the handlers' declared statuses |
| `ops` | entity → field → value type | `schema_fixture.json` |
| `export` | top-level keys, per-entity keys, `version` | export encoder structs |
| `mcp` | tool → argument names and types, result fields | `agenttools` registry |
| `cli` | command path → flags, `--json` field names, exit codes | `internal/cli` command tree |

`go test ./internal/httpapi -run TestV1SurfaceIsAdditive` builds the current surface and compares it with the file:

- anything in the file and missing now → fail, naming the entry (removal or rename);
- a type, status or policy that differs → fail (incompatible change); a policy may become *less* restrictive only through a spec change, so any policy change fails and needs the snapshot edited by hand with the reason in the PR;
- an entry present now and missing from the file → fail with "run `go test ./internal/httpapi -run TestV1SurfaceIsAdditive -update`".

`-update` only adds entries; it never deletes. Deleting by hand is caught in review because the policy forbids it, and by a repo-check that compares the file with the one at the `v1.0.0` tag once it exists (entries in the tag must still be present).

Alternative: an OpenAPI document as the source of truth. Rejected: hand-written OpenAPI drifts, generating it needs a dependency, and it would not cover ops, MCP and the CLI. The snapshot can later feed an OpenAPI export.

Alternative: per-route golden response files. Rejected for the freeze: too brittle for additive fields; the existing handler tests keep covering behaviour.

**D2. What "additive" means, written in the policy.**
Allowed in 1.x: new routes; new optional request fields; new response fields; new error codes for new conditions; new op entities and fields; new enum values where the docs mark the enum "open" (task origin kinds, notification channel kinds, rule actions); new MCP tools and optional arguments; new CLI commands and flags; new export keys. Not allowed: removing or renaming any of the above; changing a value's type or unit; making an optional field required; changing the status or code of a documented condition; narrowing accepted values; changing the meaning of a field. Clients are told to ignore unknown fields and unknown enum values (already true of the web client and the shells; the policy makes it a client obligation).

**D3. Deprecation window: 12 months and two minor releases, whichever is longer.** A deprecated route keeps working, carries `Deprecation: @<unix-seconds>` (RFC 9745) and `Sunset: <HTTP-date>` (RFC 8594), and its `docs/api.md` row says what replaces it. Removal happens only in a new major path (`/api/v2/`), so a v1 route is never removed while `/api/v1/` is served. Op fields are never removed (the op log is append-only and old ops must replay).
Alternative: 6 months. Rejected: self-hosters update rarely; a year covers an annual upgrade habit.

**D4. Upgrade fixtures from released images, not from current code.**
`scripts/release/upgrade-fixture.sh <version>` starts `ghcr.io/opentodoapp/opentodo:<version>` on an empty data directory, signs up the owner, and drives a fixed scenario through the public API of that version (projects with sections, tasks with every field that version knew, subtasks, recurrence, a shared project with a second member, a comment, an attachment, a time entry, an API token, end-to-end encryption on a second account if the version had it). It stops the container and stores `opentodo.db` (gzip) plus a manifest of expected counts in `internal/store/testdata/upgrade/<major.minor>/`. One fixture per minor (latest patch). Fixtures for 0.1–0.16 are built once by this change; each later minor adds its own at release time (`release-prepare` refuses a minor release without one).
`go test ./internal/store -run TestUpgradeFromEveryRelease` opens each fixture in a temporary directory, starts the tenant (migrations included), and checks: migrations finish; row counts in the manifest match; `POST /api/v1/sync` from cursor 0 returns every op; the export validates; the owner signs in with the fixture password and the API token still authenticates; attachments are readable. It runs in the server CI job (≈ 17 fixtures, a few seconds).
Alternative: generate fixtures by checking out old tags and building. Rejected: needs old Go toolchains and Node versions; the images already exist and are what users run.

**D5. Client compatibility by recorded requests.** `internal/sync/testdata/v1_clients/` holds request/response pairs recorded from the 1.0 web client, Android and iOS bridge calls, `ot` and the extension (headers without secrets, bodies with fixture ids). A Go test replays each request against the current server seeded with the same fixture and asserts the response still contains every field of the recorded one with the same type (extra fields allowed). Recorded once at 1.0 by `npm run test:contract -- --record`; never regenerated within 1.x (new pairs may be added).

**D6. Export guarantee.** `data-import` already imports the own format. Two committed exports, `internal/importer/testdata/export-v1-0.16.json` and `…-1.0.json`, are imported in CI; the test asserts every task, project, label, section, comment, time entry and workspace arrives. The export encoder test asserts `"format":"opentodo-export"` and `"version":1`.

**D7. Policy page and versioning.** `docs/stability.md` (audience: developer and self-host) states the surface, D2, D3, the upgrade promise, the client window, the export promise and semantic versioning: MAJOR for anything outside D2, MINOR for features, PATCH for fixes; image tags `1`, `1.x`, `1.x.y` and `stable` follow it. A docs-check link from `docs/api.md`, `docs/sync.md`, `docs/mcp.md`, `docs/cli.md` and `docs/import-export.md`.

## Data model impact

None. No op field, entity or migration.

## Size and memory

No dependency. Binary unchanged (test data only). Repository grows by about 1.5 MB of compressed fixtures.

## Interface budget

No screen changes.

## Progressive disclosure

Nothing user-visible in the app. Simple-list users see nothing new.

## Risks

- Early images may only exist under the legacy image name from before the organisation move (0.15). The script takes the image reference as an argument and the manifest records the digest it used; a version with no published image is built once from its tag with that tag's Dockerfile and recorded as such.

- A fixture scenario that an old version could not perform (no attachments before 0.x). The script skips steps the version's API refuses with 404 and records the counts it actually made.
- The snapshot may freeze an accidental field. Mitigation: before tagging 1.0 the snapshot is reviewed once (task 1.4) and anything not meant as public is renamed or removed then, while that is still allowed.
