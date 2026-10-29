# Proposal

## Why

People who leave a subscription app for OpenTodo are betting years of their tasks on it, and the scripts, phone shortcuts, n8n flows, MCP clients and CalDAV apps they connect to it are a second bet. Today nothing written says what may change between releases: `/api/v1/` is "versioned" only by its prefix, the op schema is additive by an internal rule (AGENTS.md rule 3), the export carries `"version":1` with no promise behind it, and upgrades are tested only from the previous release. The research's core trust claim (data ownership, "no lock-in") needs a public, testable contract before 1.0. Integrators of the commercial apps cite silent API breakage as a reason to leave; OpenTodo should be the app where that cannot happen within a major version.

## What Changes

- **A published compatibility policy**, `docs/stability.md`, linked from `docs/api.md`, README and the 1.0 release notes. It names the **v1 surface** and what may and may not change within 1.x:
  - every route under `/api/v1/` (method, path, request fields, response fields, status codes for documented conditions);
  - the error codes in `web/src/lib/i18n/server-error-codes.json`;
  - the sync protocol (`POST /api/v1/sync` request and response, the op envelope) and the op schema (`internal/sync/testdata/schema_fixture.json`);
  - the export format `opentodo-export` version 1, JSON and ZIP;
  - the MCP tool names, their argument names and their result fields;
  - the `ot` command names, flags, exit codes and `--json` output.
  Within 1.x only **additive** changes are allowed. Removal or an incompatible change needs `/api/v2/` (or export version 2), announced with a deprecation window of at least 12 months and two minor releases, during which both versions are served.
- **A machine-checked surface snapshot.** `internal/httpapi/testdata/v1_surface.json` records the v1 surface, generated from the route registry, the error code list, the op schema fixture, the MCP registry and the CLI command tree. A Go test fails when anything listed disappears or changes shape, and accepts additions only when the snapshot is regenerated in the same change.
- **Deprecation signalling.** A deprecated route answers with the `Deprecation` and `Sunset` headers (RFC 9745, RFC 8594) and is marked in `docs/api.md`; a deprecated op field stays accepted and served forever (the op log is append-only).
- **Supported upgrade paths, tested.** Any 0.x release from 0.1.0 on upgrades directly to 1.0, and any 1.x to any later 1.x, without an intermediate version. CI opens one fixture data directory per released minor version (0.1 … 0.16, and each 1.x minor as it ships), migrates it, and checks that every task, project, op and attachment survives and that sync, export and sign-in work.
- **Client compatibility window.** A 1.x server accepts sync and REST requests from any 1.x client (web app cached on a phone, Android and iOS shells, `ot`, the extension, the Obsidian plugin). Recorded request fixtures from 1.0 clients are replayed against every later server in CI.
- **Export guarantee.** Every 1.x server writes `"format":"opentodo-export","version":1` and imports every version 1 export written by any 0.x or 1.x release; fixture exports from 0.16 and 1.0 are imported in CI.
- **Semantic versioning statement** for releases and image tags.

No new environment variable, no new dependency, no op schema change. Not **BREAKING**: it freezes what exists.

## Out of scope

- Internal Go packages, the database schema (SQLite tables are not an interface; only migrations from old versions are promised), the web app's UI and its IndexedDB layout, log lines, and the `ot` human (non-`--json`) output.
- Downgrades. A data directory opened by a newer version is not promised to open with an older one; the backup taken before migration is the way back (existing `backup-restore`).
- `/api/v2/`. No v2 is planned; this change only defines how one would be introduced.
- CalDAV wire behaviour (covered by RFC 4791 and the `caldav-verified` change) and webhook payloads (already versioned by their `version` field; they join the policy text but keep their own spec).

## Roadmap

Advances ROADMAP-1.0 milestone 1.0 "Trust", item `stability-contract`.

## Capabilities

### New Capabilities

- `api-stability`: the compatibility policy, the surface snapshot and its additive-only check, deprecation headers, tested upgrade paths from every 0.x minor, the client compatibility window and the export format guarantee.

### Modified Capabilities

None. `http-api`, `offline-first-sync`, `self-hosting` and `data-import` keep their requirements; the new capability adds the guarantees on top of them.

## Impact

- **Data model, sync, op schema, E2EE:** none. The snapshot freezes the current op schema fixture; new fields stay possible.
- **API/CLI/MCP:** no behaviour change; a deprecated route (none at 1.0) would gain two headers.
- **Repository:** `docs/stability.md`, `internal/httpapi/testdata/v1_surface.json` and its test, `internal/store/testdata/upgrade/` (about 17 compressed SQLite fixtures, about 60 KB each, about 1 MB total), `internal/sync/testdata/v1_clients/` request fixtures, a script that builds fixtures from released images.
- **Binary and bundle size:** none (fixtures are test data, not embedded).
