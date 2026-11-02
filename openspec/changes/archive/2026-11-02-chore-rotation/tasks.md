# Tasks

## 1. Data model and shared logic

- [x] 1.1 Add `task.rotation` (id list, default `[]`) to `Schema` in `internal/sync/ops.go` with a comment citing this change. Regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync/ -run TestGeneratedOpSchema`. Verify: `go test ./internal/sync/...` passes, and the generated web schema lists the field as non-content.
- [x] 1.2 Membership check at receipt in `Apply` (reason `not_a_member`, the whole op refused, at most 20 distinct ids). Verify: `internal/sync` tests for a non-member, duplicates, and acceptance on a non-recurring task (inert).
- [x] 1.3 `nextAssignee` in `web/src/lib/rotation.ts` and `internal/sync/rotation.go`, with `web/src/lib/rotation.vectors.json` (wrap-around, current outside the list, empty current, departed member in the middle, all departed, single member). Verify: `rotation.test.ts` (`npm test`) and `go test ./internal/sync/ -run Rotation`, both reading the same file.

## 2. Completion

- [x] 2.1 `planCompletion` in `web/src/lib/recurring.ts` writes the next assignee in the same batch, and never on skip, detach, reopen or when the series ends. Verify: `recurring.test.ts` cases, including two simulated devices completing the same occurrence and producing identical batches.
- [x] 2.2 Server completion in `internal/sync/recurring.go` (REST, CalDAV, MCP, rules) rotates with the Go twin. Verify: `go test ./internal/sync/... ./internal/httpapi/...` with tests for a REST completion, a CalDAV completion (`caldav_test`), an MCP `complete_tasks` call, and a stale offline batch whose assignee op is refused while the record and due are accepted.
- [x] 2.3 The assignment notification reads "It's your turn: <title>" when the assignee changed in a batch that completed the series (the generic text for encrypted accounts and channels without titles). Verify: `internal/notify` and `internal/channels` message tests in six languages.

## 3. Departure repair

- [x] 3.1 In the server-authored departure batch (leave, removal, group removal or deletion, account deletion), remove the account from every rotation in the project, and assign rotating tasks it held to the next remaining member (or `null`). Verify: `internal/sync` membership tests for each departure path and for the last other member leaving.

## 4. API, CLI, MCP

- [x] 4.1 REST: `rotation` in task reads, `PATCH` validation (400 `invalid_rotation`, 409 `not_a_member`, 403 viewer, 401 without credentials). Add the new error code to the error-code fixture. Verify: `go test ./internal/httpapi/...`.
- [x] 4.2 `ot task edit --rotate a,b` / `--no-rotate` (people resolved by name or email) and "Takes turns" in `ot task show`. Verify: `go test ./internal/cli/...`.
- [x] 4.3 Agent tools: the rotation in the task view (member names) and in `update_tasks`. Verify: `go test ./internal/agenttools/... ./internal/mcp/...`.

## 5. Web client

- [x] 5.1 "Take turns…" in the Assignee menu (recurring task, at least two members, editors and above), and the rotation sheet with the Combobox, "Add everyone in <group>", drag and Alt+Up/Down reorder, and Stop taking turns. Verify: an interaction test (happy-dom), and a story in both themes and at phone width.
- [x] 5.2 Panel line "Takes turns", the row avatar glyph with its accessible name, read-only for viewers, a departed person marked "left the project". Verify: component tests and `make ui-lint`.
- [x] 5.3 Strings in `messages.json` and the five catalogs. Verify: `node scripts/i18n-check.mjs`.
- [x] 5.4 `npm test` and `npm run build` pass.

## 6. Documentation and release

- [x] 6.1 A "Take turns" section in `docs/roles-and-assignments.md`, a pointer in `docs/recurrence.md`, `rotation` and `invalid_rotation` in `docs/api.md`, the CLI flags in `docs/cli.md`, the MCP field in `docs/mcp.md`. Verify: `make docs-check`.
- [x] 6.2 CHANGELOG entry under Unreleased (Added).
- [x] 6.3 `make check` (TZ=UTC) passes.

## Implementation notes

- 4.2: the CLI has no `ot task show`/`ot task edit`; the flags are on `ot edit`, which prints "Takes turns: Alice* → Bob → Carol" after `--rotate`, and `--json` output carries `rotation`.
- 5.1: the rotation editor opens in the Assignee editor's anchored popover (the bottom sheet every task panel editor uses below 640 px), not a separate sheet (owner rule: no modals for pickers). Reordering is a drag on the handle (pointer and touch) or Alt+Up/Down.
- 5.2: the "Takes turns" line shows in both property layouts (the facet lines and the Schedule/Details facts, including the phone's stacked list).
- A split ("This and following") carries the rotation to the new piece, on the server and in the app.
