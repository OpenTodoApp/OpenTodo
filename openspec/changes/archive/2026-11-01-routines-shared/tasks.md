# Tasks

Prerequisites: `routines-engine`, `routines-editor`, `routines-dynamic-data`, `routines-find-scope` and `routines-ai-step` part 1 are merged.

## 1. Entity and scope

- [x] 1.1 `internal/sync/ops.go`: `rule.project_id` (nullable string, documented); regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; verify `go test ./internal/sync/...`
- [x] 1.2 `scope.go`: `rule` as a project child, `CanWrite` for editors and admins, `scope_change`; `members.go`: first-share relabel; `trash.go`: purge with the project; verify `go test ./internal/sync/...` (viewer refused, editor accepted, relabel)

## 2. Engine

- [x] 2.1 Column step `store.migrateRoutinesShared` (`rule_state.run_as`, `run_as_since`, `paused_by`, `rule_runs.project_id`, `rule_events.for_project`); verify `go test ./internal/store/...`
- [x] 2.2 `internal/rules`: run-as person from the winning `enabled: true` author; shared routines load for their run-as person only; role checked before each run; runs recorded with the project; verify `go test ./internal/rules/...`
- [x] 2.3 Project bound (D3): the bounded world, the write check, `not_in_shared` and `not_yet` availability, events from any member's batches (`for_project`); verify `go test ./internal/rules/... ./internal/ruleval/...`
- [x] 2.4 Pause on another member's edit (`edited_by_other`, `paused_by`); AI mode `not_run_as`; verify `go test ./internal/rules/...`
- [x] 2.5 Pause on loss of access (`run_as_left`, `run_as_viewer`) after member changes and before runs, `routine_paused_shared` to owner, admins and editors; verify `go test ./internal/rules/... ./internal/httpapi/...`
- [x] 2.6 Encryption: the bounded world is plaintext; encrypted text in a shared routine fails with `encrypted`; verify `go test ./internal/rules/...`

## 3. Routes and clients

- [x] 3.1 REST checks (project bound at save, labels, 50 per project), `run_as` and `project` in the representation, runs and run detail for members, Run now and Undo by role; verify `go test ./internal/httpapi/...` (401, 404 for non-members, 403 for a viewer's run and undo)
- [x] 3.2 CLI (`--project`, PROJECT and RUNS AS columns) and MCP (`project` on create, `project_id` and `run_as` on list and get); verify `go test ./internal/cli/... ./internal/agenttools/... ./internal/mcp/...`
- [x] 3.3 Web: Where menu on New routine, project chip and "Runs as" in rows and the editor header, pause reasons, read-only for viewers, the pause notice before saving, `not_in_shared` marks in Add step, plaintext for shared routines in e2ee, the project menu's Routines entry and the page filter; verify happy-dom tests and `npm test`
- [x] 3.4 Strings in the six catalogs; verify `make i18n-check`

## 4. Checks

- [x] 4.1 `docs/routines.md` (shared routines), `docs/sharing.md`, `docs/api.md`, `docs/cli.md`, `docs/mcp.md`; verify `make docs-check`
- [x] 4.2 CHANGELOG Unreleased entry; `go test ./...`, `npm test`, `npm run build`, `make check`, `make openspec-validate`
