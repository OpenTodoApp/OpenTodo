# Tasks

## 1. Tool

- [x] 1.1 `set_today_focus` (`internal/agenttools/write_focus.go`) with `ruleval.PlanSetFocus`, the user's own tasks only, personal scope; `focus` in `today_summary`; descriptions, golden files, device manifest and `v1_surface.json` updated. Verify: `go test ./internal/agenttools ./internal/assistant ./internal/mcp ./internal/httpapi`.
- [x] 1.2 Set, replace, clear, more than three refused, a foreign or unknown task refused, a task assigned to someone else refused, Bento slots, the write gate and `token_restricted`, `today_summary` reflecting it. Verify: `go test ./internal/agenttools -run TestSetTodayFocus`.

## 2. Docs and checks

- [x] 2.1 `docs/mcp.md`, `skills/opentodo-mcp/SKILL.md` and its plugin copy, the plugin's `today` skill; `changelog.d/Added/mcp-set-today-focus.md`. Verify: `make docs` and `make docs-check`.
- [x] 2.2 `make openspec-validate` and `go test ./...` pass.
