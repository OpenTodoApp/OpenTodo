# Tasks

## 1. The condition's "is not"

- [x] 1.1 `internal/ruleval` reads `project`, `section` and `priority` as `{in}` or `{not_in}` (exactly one, at least one entry) and the matcher evaluates `not_in` (D2). Verify with `go test ./internal/ruleval` (parse cases and the shared vectors).
- [x] 1.2 `web/src/lib/rules/match.ts` and `types.ts` read the same forms, and `summary.ts` reads them as "not in …", "not in section …", "not priority …". Verify with the new vectors in `match.vectors.json` (`npm test` in web/) and `conditions.test.tsx`.

## 2. A routine's workspace

- [x] 2.1 `rule.workspace_id` in `internal/sync/ops.go` `Schema`, with the generated files written by `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`. Verify with `go test ./internal/sync`.
- [x] 2.2 The engine's world of one workspace, its triggers, Run now, Test, Find tasks and creates, and `outsideWorkspace` before a run writes and on device commits and encrypted proposals (D1, D4). Verify with `internal/rules/workspace_test.go`.
- [x] 2.3 The planner skips a move into another workspace's project ("other workspace") and Change tasks fails with `other_workspace` (D6), on the server and the device. Verify with the two new cases in `plan.fixture.json` (`go test ./internal/rules`, `npm test` in web/) and `web/src/lib/rules/run/workspace.test.ts`.
- [x] 2.4 The device world of one workspace in `run/load.ts` and the device run's `workspace_gone`. Verify with `web/src/lib/rules/run/workspace.test.ts`.
- [x] 2.5 REST: `workspace_id` checked on the rule routes and the draft test, `workspace_gone` on Run now and Test. Verify with `internal/httpapi/routine_conditions_test.go`.
- [x] 2.6 Agent tools: `workspace` on `create_routine` and `update_routine`, `workspace_id` in `list_routines` and `get_routine`, the tools golden files updated. Verify with `go test ./internal/agenttools ./internal/httpapi`.

## 3. The editor

- [x] 3.1 The When card's workspace word, a new routine saved with the current workspace, and the list's meta line (D3). Verify with `web/src/app/routines/conditions.test.tsx` (happy-dom, `waitFor`).
- [x] 3.2 Names across workspaces and pickers of the routine's workspace (D5). Verify with the display-bug regression test in `conditions.test.tsx` ("Website (Work)", never "a removed project").
- [x] 3.3 The condition panel's Any / Is / Is not / No project tests for project, section and priority. Verify with the interaction tests in `conditions.test.tsx`.
- [x] 3.4 Strings in every catalogue. Verify with `make i18n-check`.

## 4. Docs and checks

- [x] 4.1 `docs/routines.md`, `docs/automations.md` and `docs/api.md` describe the workspace and the `not_in` forms; `changelog.d/Added/routine-conditions.md`; the ROADMAP row. Verify with `make docs` and `make docs-check`.
- [x] 4.2 The first load stays within `web/bundle-budget.json`. Verify with `npm run build` in web/ and `make bundle-budget`.
- [x] 4.3 Visual baselines for the changed screens only. Verify with `make ui-baselines` and `make ui-check`.
- [x] 4.4 `make openspec-validate`, `go test ./...` and `npm test` pass.
