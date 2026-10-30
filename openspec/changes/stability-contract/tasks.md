# Tasks

## 1. Surface snapshot

- [ ] 1.1 Surface builder in `internal/httpapi` (routes and policies from the registry, request and response fields from the documented structs, error codes and statuses), `internal/agenttools` (MCP tools), `internal/cli` (commands, flags, `--json` fields, exit codes), the op schema fixture and the export encoder; verify `go test ./internal/httpapi -run TestV1SurfaceBuilder` lists a known route, tool, command and op field
- [ ] 1.2 `TestV1SurfaceIsAdditive` with an add-only `-update` mode; verify unit cases for a missing route, a renamed field, a changed status, a changed policy, a field becoming required and an unlisted new route (`go test ./internal/httpapi/...`)
- [ ] 1.3 Repo check comparing the snapshot with the one at the `v1.0.0` tag (skipped while the tag does not exist); verify `node --test scripts/repo-checks.test.mjs` with a fixture tag in a temporary repository
- [ ] 1.4 Review the generated snapshot once before 1.0 and record in the PR anything renamed or removed while still allowed; verify the snapshot is committed and `go test ./...` passes

## 2. Deprecation

- [ ] 2.1 A `.deprecated(since, sunset, replacement)` route modifier that sets `Deprecation` and `Sunset` and is listed in the snapshot; verify a handler test on a test-only route asserts both headers and an unchanged body (`go test ./internal/httpapi/...`)
- [ ] 2.2 `docs/api.md` column or marker for deprecated routes; verify `make docs-check`

## 3. Upgrade fixtures

- [ ] 3.1 `scripts/release/upgrade-fixture.sh <version>` driving the fixed scenario against the released image, skipping steps the version refuses, writing `opentodo.db.gz` and `manifest.json`; verify it runs for 0.16.0 locally and the manifest counts match a manual `sqlite3` count
- [ ] 3.2 Fixtures for every released minor 0.1 … 0.16 under `internal/store/testdata/upgrade/`; verify the directory has 16 entries and each manifest names its source image digest
- [ ] 3.3 `TestUpgradeFromEveryRelease` (migrate, counts, pull from cursor 0, export validates, password sign-in, token auth, attachment readable, cursor continuation for a device that synced before); verify `go test ./internal/store/... ./internal/tenant/...` and a deliberately broken migration fails it
- [ ] 3.4 `scripts/release/prepare.mjs` refuses a new minor without its fixture; verify `node --test scripts/release/prepare.test.mjs`

## 4. Client and export compatibility

- [ ] 4.1 Recording mode for the contract tests (`npm run test:contract -- --record`) writing pairs to `internal/sync/testdata/v1_clients/` for sync, task CRUD, the shells' bridge calls, `ot` and the extension, secrets stripped; verify the files contain no session or token values (a repo-check grep)
- [ ] 4.2 Go replay test asserting recorded fields and types are present (extra fields allowed); verify `go test ./internal/sync/...` and a removed response field fails it
- [ ] 4.3 Export fixtures `export-v1-0.16.json` and `export-v1-1.0.json` with an import test that checks every entity arrives; verify `go test ./internal/importer/...`

## 5. Documentation and release

- [ ] 5.1 `docs/stability.md` (surface, additive rules, deprecation window, upgrade promise, client window, export promise, semantic versioning and image tags); links from `docs/api.md`, `docs/sync.md`, `docs/mcp.md`, `docs/cli.md`, `docs/import-export.md`, README; verify `make docs-check` including the new link check
- [ ] 5.2 `docs/contracts.md` mentions the snapshot and the upgrade fixtures; `CONTRIBUTING.md` explains `-update` and when the snapshot may change; verify `make repo-check`
- [ ] 5.3 CHANGELOG entry under Unreleased; verify `make check` passes
