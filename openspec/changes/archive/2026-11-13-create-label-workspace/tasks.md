# Tasks

- [x] 1.1 `create_label` takes `workspace_id` (id or name), writes it, and finds an existing label only in that workspace. Verify: `go test ./internal/agenttools -run TestCreateLabelInWorkspace`; the tools/list goldens show the argument.
- [x] 1.2 A shared label name on `create_tasks` and `update_tasks` resolves to the label of the task's workspace. Verify: `go test ./internal/agenttools -run TestCreateLabelInWorkspace`.
- [x] 1.3 The agent route `POST /api/v1/labels` passes `workspace_id`; an unknown workspace is 400. Verify: `go test ./internal/httpapi -run TestLabelCreateInWorkspace`.
- [x] 1.4 `docs/mcp.md` and `docs/api.md` name the argument. Verify: `make docs-check`.
