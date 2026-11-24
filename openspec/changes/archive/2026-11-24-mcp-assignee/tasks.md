# Tasks

## 1. Tools

- [x] 1.1 `assignee` on `create_tasks` items and `update_tasks` updates (`internal/agenttools/write_assignee.go`), resolved by id, email, name or `me` among the task's assignable people, `null` unassigning; the tool descriptions and golden files updated. Verify: `go test ./internal/agenttools`.
- [x] 1.2 Assign, change, unassign, a non-member (by id, by email) refused with nothing written, a personal task only to the user, a viewer refused with `forbidden`. Verify: `go test ./internal/agenttools -run TestAssignee`.

## 2. Docs and checks

- [x] 2.1 `docs/mcp.md`, `skills/opentodo-mcp/SKILL.md` and its plugin copy; `changelog.d/Added/mcp-assignee.md`. Verify: `make docs` and `make docs-check`.
- [x] 2.2 `make openspec-validate` and `go test ./...` pass.
