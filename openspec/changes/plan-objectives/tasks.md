# Tasks

## 1. Data model

- [ ] 1.1 Add entity `objective` to `internal/sync/ops.go` `Schema`:
  - `title` (Content, 1–140 characters, one line);
  - `period` (quarter or week, validated with `internal/sector` from `time-sectors`, which this change brings with it if it lands first);
  - `position`, `done_at`, `created_at`, `deleted_at`.

  Also add `objectives` to `Plural` and `user_prefs.objectives`, mirrored in `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. Verify with `go test ./internal/sync/...`: a month period and an over-long title are refused, LWW holds per field, the entity resolves to the personal scope and another member never receives it.
- [ ] 1.2 Migration `internal/store/migrations/NNNN_objectives.sql` for the materialized table. Verify with `go test ./internal/store/...`.
- [ ] 1.3 E2EE: `objective.title` in `internal/e2ee.ContentFields` and `CONTENT_FIELDS` in `web/src/lib/e2ee.ts`, the re-write job covering objectives, and the field split in `docs/e2ee.md`. Verify with `go test ./internal/e2ee/...`, `npm test` (`e2ee.test.ts` and the shared `e2ee.vectors.json` if fields are listed there) and a re-write job test.

## 2. Server interfaces

- [ ] 2.1 REST `objectives` collection on the existing routes:
  - `period` and `open` list filters;
  - `409 too_many_objectives` (error code fixture and message);
  - `read` and `agent` tokens refused on writes with `403 insufficient_scope`;
  - 404 for another account.

  Add a route matrix row in `internal/httpapi/route_matrix_test.go`. Verify with `go test ./internal/httpapi/...` (create, patch, delete tombstone, anonymous 401, read token 403, other account 404, invalid 400, limit 409, policy test).
- [ ] 2.2 Export `objectives` with tombstones, and the own-export importer restores them through ops with device `import`. Verify with `go test ./internal/httpapi/... ./internal/importer/...`.
- [ ] 2.3 MCP `list_objectives` and `opentodo://objectives` in `internal/agenttools` and `internal/mcp`, with titles marked untrusted and encrypted accounts degrading to `title: null` with `encrypted: true` unless the relay answers. Verify with `go test ./internal/agenttools/... ./internal/mcp/...`.
- [ ] 2.4 CLI `ot objectives` (list, add with `--quarter`/`--week`/`--next`, done, undone, edit, delete), `--json`, `--dry-run`, `ot schema` and the skill text. Verify with `go test ./internal/cli/...`.
- [ ] 2.5 `docs/api.md` (collection, error code, MCP tool) and `docs/cli.md`. Verify with `make docs-check`.

## 3. Client

- [ ] 3.1 `web/src/lib/objectives.ts`: reads by period, `mutate()` writes, the per-period limit, and the current quarter and week through `web/src/lib/sectors.ts`. Verify with `objectives.test.ts` (`npm test`), covering offline add, concurrent edit convergence and the limit with six after sync.
- [ ] 3.2 Plan strip:
  - quarter and week groups, plus next week when the span starts there;
  - one-line cards with Enter, Space, Delete with confirm and Undo, Alt+Up/Down and drag;
  - collapsed state per device;
  - the phone summary line and sheet.

  Verify with an interaction test (`// @vitest-environment happy-dom`), stories in both themes and at 390 px (`make storybook`, `make ui-check`), and the shortcut registry test showing no conflict.
- [ ] 3.3 Weekly review Objectives section in Look ahead (planned week rule with its toggle, Carry/Done/Drop, new-quarter offer). Verify with review tests in `npm test` (Sunday plans next week, carry writes the period, quarter turn, offline, switch off).
- [ ] 3.4 Settings → Account → How you work: the Objectives switch. Verify with a settings test (one op, unknown value kept) and `settingsCopy.test.ts`.
- [ ] 3.5 i18n: every new string in en, de, fr, it, es and pt. Verify with `make i18n-check`.
- [ ] 3.6 `npm run build` and `make ui-lint`; bundle budget unchanged for the entry chunk. Verify with `make bundle-budget`.

## 4. Documentation

- [ ] 4.1 New `docs/objectives.md` (the cascade, the limit, Plan strip, review section, carry-over, encryption), pointers from `docs/review-and-statistics.md` and `docs/calendar-views.md`, and a `docs/README.md` row. Verify with `make docs-check`.
- [ ] 4.2 CHANGELOG Unreleased "Added" entry. Verify by the entry being present in the PR diff.

## 5. Integration

- [ ] 5.1 `go test ./...`, `cd web && npm test && npm run build`, and `make check` (TZ=UTC) all pass.
- [ ] 5.2 Manual smoke on `./bin/opentodo`:
  1. Turn Objectives on.
  2. Add a quarterly and a weekly objective in the Plan.
  3. Mark one done.
  4. Open the review on a Sunday (device date) and carry one to next week.
  5. Turn encryption on and see the titles still shown.

  Verify by the observable result of each step.
