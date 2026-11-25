# Tasks

## 1. Data model and the resolver

- [x] 1.1 Add the additive op field `field.workspace_id` to `internal/sync/ops.go` and regenerate (design D1). Verify: `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`, then `go test ./internal/sync -run TestGeneratedOpSchema`.
- [x] 1.2 `ApplicableFields` and `WorkspaceFields` take a placement in `internal/sync/fields.go`; `Service.Partition` exported; `reach.go` places a workspace field by its `workspace_id` (design D1, D2). Verify: `go test ./internal/sync`.
- [x] 1.3 The TS twin in `web/src/lib/fieldTree.ts`; eight workspace cases in `web/src/lib/fields.vectors.json`, read by both sides; the contracts row renamed. Verify: `go test ./internal/sync -run TestFieldVectors`, `cd web && npx vitest run src/lib/fields.test.ts`.

## 2. Server, tools, export and import

- [x] 2.1 `internal/httpapi/fields.go`: create with `workspace_id` for an owned workspace, refusals for both or neither, an unknown or not-owned workspace, name clashes and the limit across the workspace, `workspace_id` immutable, task values for workspace fields (design D3, D5). Verify: `go test ./internal/httpapi -run 'TestWorkspaceFields|TestFields'`, including the 401 scenario.
- [x] 2.2 `internal/agenttools`: `list_projects` lists workspace fields with `workspace_id`; values and patches use them. Verify: `go test ./internal/agenttools -run TestWorkspaceFieldsInTools`.
- [x] 2.3 `internal/importer`: an own export restores a workspace field and its values; a chosen target workspace is stamped. Verify: `go test ./internal/importer -run TestOwnExportRoundTripKeepsWorkspaceFields`.

## 3. Web app

- [x] 3.1 `lib/fields.ts`: `createWorkspaceField`, rename, reorder, option rename and value counts for workspace fields, the name and limit checks across a workspace, and workspace fields in the project checks. Verify: the "workspace fields" tests in `web/src/lib/fields.test.ts`.
- [x] 3.2 The placement reaches every reader: `useFieldPlacement` and `useApplicableFields` (`lib/localData.ts`), filters (`useWorkspaceFilter`, `FilterView`), sorting (`FieldSortContext`, `listGroups`, `useListModel`). Verify: `cd web && npm test`.
- [x] 3.3 `FieldsDialog` in workspace mode and the read-only "From *Workspace*" group in a project's dialog; the Fields row in `WorkspaceGeneral` for the owner (design D4). Verify: the "workspace fields" tests in `web/src/app/fieldsDialog.test.tsx` (with axe), `npm run build`, `make i18n-check` (all ten catalogs).

## 4. Docs and release

- [x] 4.1 `docs/custom-fields.md` ("Fields of a workspace"), `docs/api.md`, `docs/mcp.md`; regenerate the help. Verify: `make docs` and `make docs-check`.
- [x] 4.2 Changelog fragment `changelog.d/Added/workspace-fields.md` (Refs #2029) and the ROADMAP row. Verify: `make repo-check`, `make openspec-validate`, `make check`.
