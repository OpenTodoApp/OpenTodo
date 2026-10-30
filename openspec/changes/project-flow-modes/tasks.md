# Tasks

## 1. Fields and sync

- [ ] 1.1 Add `project.flow_mode` and `section.flow_mode` (`kString`, default `""`, not content) to `Schema` in `internal/sync/ops.go` with doc comments; regenerate `web/src/generated/opSchema.ts` and the contract fixture with `UPDATE_OP_SCHEMA=1 go test ./internal/sync/...`; verify `go test ./...` passes and an e2ee test shows neither field in `e2ee.ContentFields`
- [ ] 1.2 Read the fields in `web/src/lib/types.ts` and the row defaults in `web/src/lib/ops.ts` (unknown values read as the default, nothing rewritten); verify with a `ops.test.ts` case for an unknown value

## 2. The shared availability rule

- [ ] 2.1 Write `internal/flow/testdata/flow_fixture.json`: parallel, sequential and area projects; following, Parallel and Sequential sections; deferred, blocked, delegated, Someday, recurring, habit, completed and deleted steps; subtasks of waiting steps; a reorder; tasks without a project
- [ ] 2.2 Implement `web/src/lib/flow.ts` (`availability`: available, waits in sequence, holding step) and `flow.test.ts` over the fixture; verify `npm test -- flow`
- [ ] 2.3 Implement the leaf package `internal/flow` with the same rule over `opsync.Entity` rows and a test over the same fixture; verify `go test ./internal/flow/...`
- [ ] 2.4 Use `flow.ts` in `MethodRules.actionable` and exclude waiting steps from `waiting` (`web/src/lib/method/rules.ts`); make areas never `needsNextAction`; extend `internal/digest/testdata/next_action_fixture.json` with sequential and area cases and the Go `WithoutNextAction` with `internal/flow` and areas; verify `npm test -- method` and `go test ./internal/digest/...`

## 3. Lists, boards and Today

- [ ] 3.1 Dim waiting steps and show the "After *step*" marker in the blocked marker's slot in `TaskRow` and board cards, with the text alternative and truncation at 360 px; verify a row test and the TaskRow story in light, dark, 375 and 1280 px (`make ui-check`)
- [ ] 3.2 Put waiting steps due today or earlier in Today's Blocked group and take them out when they become available; verify a Today test that completes the current step and sees the next one move without a reload
- [ ] 3.3 Health: skip Quiet and progress for areas in `web/src/lib/projectHealth.ts`, show "Area" in the All projects progress cell, and sort areas after projects that have a progress; verify `npm test -- projectHealth ProjectsTable`

## 4. Choosing a flow

- [ ] 4.1 Add the "Flow…" submenu to the project menu (sidebar and header) and the section heading or column menu, one op with Undo. Hide it in `lists` mode unless a flow other than the default is stored, and hide it from those without the right role. Verify menu tests for each mode and role, and the keyboard path
- [ ] 4.2 Add "Set project flow…" to the command palette in every mode; verify `npm test -- palette`
- [ ] 4.3 Add strings in the six languages (en, de, fr, it, es, pt) for the menu, the descriptions, the marker and "Area"; verify the locale completeness test

## 5. Filter keyword

- [ ] 5.1 Add `available` to the client filter grammar and evaluator, and to `simpleKeywords` in `internal/filter/filter.go`; verify `npm test -- filter` and `go test ./internal/filter/...`
- [ ] 5.2 Document `available` in `docs/filters.md`, the published grammar and the in-app filter help

## 6. API, agent tools, MCP, CLI

- [ ] 6.1 Accept and validate `flow_mode` on `projects` and `sections` in REST (`400 invalid_input` outside the set; same role rules as other fields). Verify handler tests for success, an invalid value, a viewer and an unauthenticated request
- [ ] 6.2 Accept `flow_mode` on `create_project`, `update_project` and the section tools, return it in project and section output and the `opentodo://` project resources, and add `available` to `list_tasks` using `internal/flow`. Update the tool goldens (`internal/agenttools/testdata`). Verify `go test ./internal/agenttools/... ./internal/mcp/...`
- [ ] 6.3 Add `ot tasks --available` and show the flow in `ot projects`, plus completion. Verify `go test ./internal/cli/...`
- [ ] 6.4 Update `docs/api.md` (Project fields, Sections), `docs/mcp.md` and `docs/cli.md`

## 7. Vault

- [ ] 7.1 Read and write `opentodo-flow` on project files in `internal/vault` (left out for Parallel; an unknown value is kept and not written). Extend the fixture vault and `docs/vault.md`. Verify `go test ./internal/vault/...`

## 8. Docs and release notes

- [ ] 8.1 Write the user docs for Sequential projects, sections and Areas in `docs/projects.md` and `docs/all-projects.md` (the "Area" progress cell), including what Simple-list users see; verify `make docs-check`
- [ ] 8.2 Add a CHANGELOG entry under Unreleased when the change is archived

## 9. Integration

- [ ] 9.1 Run `make check`. Then, in the built app, make a project sequential on one device while offline on another, complete steps on both and check that they converge on the same available step
