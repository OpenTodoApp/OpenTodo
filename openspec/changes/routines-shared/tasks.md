# Tasks

Prerequisites: `routines-engine`, `routines-editor` and `routines-ai-step` are merged.

## 1. Entity and scope

- [ ] 1.1 `internal/sync/ops.go`: `rule.project_id` (nullable string, documented); regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; verify `go test ./internal/sync/...`
- [ ] 1.2 `scope.go`: a rule with `project_id` as a project child, `CanWrite` for owner, admin and editor, `scope_change` refused, 50 per project; `members.go`: first-share relabel, pause on leave, removal, viewer and unshare; `trash.go`: cascade with the project; verify `go test ./internal/sync/...` (viewer refused, relabel keeps `seq`, convergence of concurrent edits)

## 2. Engine

- [ ] 2.1 `internal/rules`: run-as person from the winning `enabled: true` author (`rule_state.run_as`, `run_as_since`), role checked at planning and writing, device `rule:<rule-id>` with the run-as author; verify `go test ./internal/rules/...` ("Turned on by Alice", "Turned on again by Bob")
- [ ] 2.2 Project bound (D3): Find tasks and queries within the project, targets in it, Create tasks into it, no move out; `not_in_shared` availability for the listed steps; Notify me recipients; event triggers from any member's batches; verify `go test ./internal/rules/... ./internal/ruleval/...`
- [ ] 2.3 Pause on another member's edit (`edited_by_other`, op times vs server state); verify `go test ./internal/rules/...` (both scenarios of "Edits by another member pause the routine")
- [ ] 2.4 AI: the run-as person's assistant, consent, allowance and usage; auto mode only when the run-as person set it; proposals applied by any editor within their role; verify `go test ./internal/rules/... ./internal/assistant/...`
- [ ] 2.5 Pause on loss of access with `routine_paused_shared` to owner, admins and editors; verify `go test ./internal/rules/... ./internal/notify/...`
- [ ] 2.6 Email project members: one `routine` message per verified member in their language, the stop link and `routine_mail_optout`, limits; verify `go test ./internal/mail/... ./internal/rules/...` with `smtptest`
- [ ] 2.7 Migration `NNNN_routines_shared.sql`; verify `go test ./internal/store/...`

## 3. Routes and clients

- [ ] 3.1 Runs routes and the Inbox feed for members, filtered by visibility, Undo and proposals for editors and above; verify `go test ./internal/httpapi/...` (401, 404 for non-members, 403 for a viewer's undo)
- [ ] 3.2 CLI and MCP list shared routines with their project and run-as person; MCP writes follow the same roles; verify `go test ./internal/cli/... ./internal/mcp/...`
- [ ] 3.3 Editor: Where (Just me or a shared project), "Runs as", the pause notice before saving, `not_in_shared` marks, the project's menu Routines entry; verify happy-dom tests and `npm test`
- [ ] 3.4 Inbox card and bell for members by role; verify happy-dom tests
- [ ] 3.5 Strings in the six catalogs; verify `make i18n-check`

## 4. Checks

- [ ] 4.1 `docs/automations.md` (shared routines), `docs/sharing.md`; verify `make docs-check`
- [ ] 4.2 CHANGELOG Unreleased entry (at archive); `go test ./...`, `npm test`, `npm run build`, `make check`, `make openspec-validate`
