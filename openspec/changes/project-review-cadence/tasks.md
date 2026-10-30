# Tasks

## 1. Fields and sync

- [x] 1.1 Add `project_prefs.review_every` and `project.status` (`kString`, default `""`, not content) to `Schema` in `internal/sync/ops.go` with doc comments, and regenerate `web/src/generated/opSchema.ts` and the contract fixture with `UPDATE_OP_SCHEMA=1`. Verify `go test ./...`, and that neither field is in `e2ee.ContentFields`
- [x] 1.2 Read both fields in `web/src/lib/types.ts` with defaults in `web/src/lib/ops.ts` (unknown values read as weekly and active, nothing rewritten). Verify an `ops.test.ts` case

## 2. Review interval and the walk

- [x] 2.1 Implement the due rule in `web/src/lib/review.ts`: logical day of `reviewed_at` plus 7 or 14 days or 1 or 3 calendar months (clamped), paused never due, never reviewed always due. Verify `review.test.ts` cases for 31 January plus one month, a late-Sunday review, paused and the weekly default
- [x] 2.2 Filter `walkProjects` to due projects, base the Projects step's done rule on that set, and add the end-of-walk count with "Review them too". Verify `npm test -- review`, including the existing "Resume on another device" case unchanged
- [x] 2.3 Show the interval and "In maintenance" on the walk card, with `e` (interval choices) and `m` (maintenance, role-gated). Register both in the shortcut registry under the review scope. Verify a `ProjectWalk` interaction test, the registry conflict test, and the walk story at 375 and 1280 px
- [x] 2.4 Add a "Review every…" submenu to the project menu, shown in `lists` mode only when a non-default value is stored. Verify menu tests for each mode

## 3. Maintenance status

- [x] 3.1 Add "Put in maintenance" and "End maintenance" to the project menu and the All projects row menu, role-gated, shown in `lists` mode only for a project in maintenance, one op with Undo. Show "In maintenance" in the project page's lead line. Verify menu and header tests
- [x] 3.2 In `web/src/lib/projectHealth.ts`, keep Late, return "Maintenance" in place of Overdue, Quiet and On track, and sort it after On track. Verify `npm test -- projectHealth ProjectsTable`
- [x] 3.3 In `web/src/lib/method/rules.ts`, never mark maintenance projects stalled or without a next action. Extend `internal/digest/testdata/next_action_fixture.json` and make `WithoutNextAction` in `internal/digest` skip them. Verify `npm test -- method` and `go test ./internal/digest/...`

## 4. API, agent tools, CLI, vault

- [x] 4.1 Accept and validate `status` on the `projects` collection (`400 invalid_input` outside `active` and `maintenance`, 403 for an editor or viewer). Verify handler tests for success, an invalid value, an editor and an unauthenticated request
- [x] 4.2 Accept `status` on `update_project`, return it in project output and resources, and update the goldens in `internal/agenttools/testdata`. Verify `go test ./internal/agenttools/... ./internal/mcp/...`
- [x] 4.3 Show the status in `ot projects`. Verify `go test ./internal/cli/...`
- [x] 4.4 Read and write `opentodo-status` on vault project files (left out while active), and extend the fixture vault. Verify `go test ./internal/vault/...`

## 5. Strings and docs

- [x] 5.1 Add strings in the six languages (en, de, fr, it, es, pt) for the intervals, the end-of-walk count, the maintenance items and the health word. Verify the locale completeness test
- [x] 5.2 Document the interval and maintenance in `docs/review-and-statistics.md` and `docs/all-projects.md`, and the field in `docs/api.md`, `docs/mcp.md` and `docs/vault.md`. Verify `make docs-check`
- [x] 5.3 Add a CHANGELOG entry under Unreleased when the change is archived

## 6. Integration

- [ ] 6.1 Run `make check`. Then, in the built app, set a shared project to monthly on one account and leave it weekly on another, put it in maintenance from the owner, and check that both members see the same health word and their own walk
