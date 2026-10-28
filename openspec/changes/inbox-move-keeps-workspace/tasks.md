## 1. Client

- [x] 1.1 `keepWorkspaceFor` in `web/src/lib/workspaces.ts` and its use in `planProjectChange` (ops.ts), `updateTask`, `moveTaskAcrossScopes`, the bulk and undoable moves; tests in `web/src/lib/workspaces.test.ts` and the move tests (`npm test`, `npm run build`)

## 2. Server

- [x] 2.1 `move_tasks` and `PATCH /api/v1/tasks/{id}` with `project_id: null` write the task's workspace; tests in `internal/agenttools` and `internal/httpapi` (`go test ./...`)

## 3. Checks

- [x] 3.1 `make check`
