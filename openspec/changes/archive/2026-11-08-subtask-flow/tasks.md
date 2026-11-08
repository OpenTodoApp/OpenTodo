# Tasks

## 1. Field and rule

- [x] 1.1 `internal/sync/ops.go`: task `flow_mode`; `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema` regenerates `web/src/generated/opSchema.ts` and the schema fixture (verified by `go test ./internal/sync`)
- [x] 1.2 `internal/flow`: `ValidTask`, `TaskFlow`, `Task.FlowMode`, the nearest-parent hold in `Compute` (verified by `go test ./internal/flow`)
- [x] 1.3 `web/src/lib/flow.ts`: `taskFlowOf`, the same hold, `next()` invalidation (verified by `npx vitest run src/lib/flow.test.ts`)
- [x] 1.4 Four cases in `internal/flow/testdata/flow_fixture.json`: the issue's doghouse, completing the first step, the nearest hold inside a sequential project, the Inbox with skipped subtasks and an unknown value (both test suites)

## 2. Server

- [x] 2.1 REST: `checkTaskFlow` in `taskBodyOK`; agent-token field lists (verified by `go test ./internal/httpapi -run TestSubtaskFlowREST`)
- [x] 2.2 Agent tools: `flow_mode` on `create_tasks` and `update_tasks`, goldens refreshed (verified by `go test ./internal/agenttools -run TestSubtaskFlowTools`)

## 3. Web

- [x] 3.1 `task-detail/Subtasks.tsx`: One at a time with Undo; `flowUndoable` for a task (verified by `src/app/task-detail/subtaskFlow.test.tsx`)
- [x] 3.2 Strings in every shipped catalog

## 4. Docs and checks

- [x] 4.1 `docs/project-flows.md`, `docs/api.md`, `docs/mcp.md`; changelog fragment `changelog.d/Added/subtask-flow.md`
- [x] 4.2 `go test ./...`, `npm test` for the touched areas, `npm run build`, `make bundle-budget i18n-check ui-lint docs-check openspec-validate repo-check`
