# Tasks

## 1. Schema (server and client)

- [ ] 1.1 Add `section` entity (`name`, `project_id`, `position`, `created_at`, `deleted_at`) and `task.section_id` to `internal/sync/ops.go` `Schema` and `Plural`; verify `TestValidateAcceptsSectionOps` and that an unknown section field is still rejected (`go test ./...`)
- [ ] 1.2 Mirror the schema in `web/src/lib/types.ts` (`Section`, `SECTION_FIELDS`, `Task.section_id`) and defaults in `ops.ts`; add `sections` table and `section_id` index in `db.ts` (new database version); verify `ops.test.ts` applies section ops and defaults `section_id` to null (`npm test`)
- [ ] 1.3 Make `applyOps` skip unknown entities instead of throwing; verify `ops.test.ts` "unknown entity is ignored" (`npm test`)
- [ ] 1.4 Update `docs/sync.md` schema table; verify it lists every field in `Schema`

## 2. Server API

- [ ] 2.1 `sections` collection handlers (list, get, create, patch, delete) with validation of `name` and `project_id`, rejection of `project_id` changes; verify `TestSectionsCrud`, `TestSectionCreateRejectsMissingProject`, `TestSectionsRequireAuth` (`go test ./...`)
- [ ] 2.2 Accept and validate `section_id` on task create/patch (must exist and belong to the task's project); verify `TestTaskSectionMustMatchProject` (`go test ./...`)
- [ ] 2.3 Export includes `sections` (with tombstones); verify `TestExportIncludesSections` (`go test ./...`)
- [ ] 2.4 Document endpoints in `docs/api.md`; verify examples match the handler routes and payloads

## 3. Client data layer

- [ ] 3.1 `createSection`, `renameSection`, `reorderSection`, `deleteSection` (clears `section_id` on its open tasks, one op each); verify `ops.test.ts` "delete section moves tasks to no section" (`npm test`)
- [ ] 3.2 `moveTaskToSection(id, sectionId | null)` writing `section_id` and end-of-column `position` in one mutation; `updateTask` clears `section_id` whenever `project_id` changes; verify `ops.test.ts` "concurrent moves resolve to newer" and "project change clears section" (`npm test`)
- [ ] 3.3 Grouping helper that buckets open tasks by section with dangling references under "No section"; verify `sections.test.ts` cases for deleted, foreign-project and missing sections (`npm test`)
- [ ] 3.4 Per-device view mode and collapsed sections in `meta`; verify `sections.test.ts` persistence round trip (`npm test`)

## 4. UI

- [ ] 4.1 Section headings in `TaskListView.tsx` with counts, per-heading quick add, collapse, heading menu (rename, move up/down, delete); verify browser flow matching the "Grouped list" and "Delete with tasks" scenarios
- [ ] 4.2 `BoardView.tsx`: columns, per-column count and quick add, horizontal scroll with snap on narrow screens, `v` toggle, `h`/`l` and Left/Right column navigation, Shift+Left/Right moves; verify browser flow: toggle persists per project per device, keyboard move keeps selection
- [ ] 4.3 Pointer-based drag primitive (`lib/dnd.ts`) and drop targets on columns and headings; verify browser flow with mouse and touch emulation: dropped task lands last in the target column
- [ ] 4.4 Section picker in `TaskDetail.tsx` limited to the task's project; verify browser flow: choosing a section moves the task; changing project resets the picker to none
- [ ] 4.5 Update `?` help with `v`, `h`/`l`, Shift+arrows; `npm run build` passes with bundle growth under 10 KB gzipped; verify by comparing `dist` sizes

## 5. Integration and docs

- [ ] 5.1 Two-device browser run: create sections on A, move tasks on B offline, delete a section on A, reconnect; verify identical boards on both devices and no task lost
- [ ] 5.2 README feature list and CHANGELOG under Unreleased; verify `make check` passes
