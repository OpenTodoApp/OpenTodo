# Tasks

## 1. Schema (server and client)

- [ ] 1.1 Add `label` entity (`name`, `color`, `position`, `created_at`, `deleted_at`) to `internal/sync/ops.go` `Schema` and `Plural`; verify `TestValidateAcceptsLabelOps` (`go test ./...`)
- [ ] 1.2 Mirror in `web/src/lib/types.ts` (`Label`, `LABEL_FIELDS`), defaults in `ops.ts`, `labels` table in `db.ts` (database version bump); add the unknown-entity guard in `applyOps` if not already present; verify `ops.test.ts` applies label ops (`npm test`)
- [ ] 1.3 Update `docs/sync.md` schema table and the whole-array caveat section; verify the table lists every field in `Schema`

## 2. Server API

- [ ] 2.1 `labels` collection handlers (list, get, create, patch, delete); verify `TestLabelsCrud`, `TestLabelsRequireAuth` (`go test ./...`)
- [ ] 2.2 Validate task `labels` ids on create/patch against existing non-deleted labels; verify `TestTaskLabelsMustExist` (`go test ./...`)
- [ ] 2.3 Export includes `labels`; verify `TestExportIncludesLabels` (`go test ./...`)
- [ ] 2.4 Document in `docs/api.md`; verify examples match handlers

## 3. Client data layer

- [ ] 3.1 `createLabel` (case-insensitive uniqueness check), `updateLabel`, `reorderLabel`; verify `labels.test.ts` "duplicate name refused" (`npm test`)
- [ ] 3.2 `addLabel(taskId, labelId)` / `removeLabel` reading the current array in the same transaction before writing; verify `labels.test.ts` "sequential adds keep both" and "concurrent adds resolve to newer array" (`npm test`)
- [ ] 3.3 `deleteLabel` (tombstone + remove id from carrying tasks) and `mergeLabels(source, target)` (rewrite arrays, de-duplicate, tombstone source); verify `labels.test.ts` "delete removes from tasks", "merge yields union without duplicates" (`npm test`)
- [ ] 3.4 Display helpers: resolve ids to labels hiding unknown and deleted ids; duplicate detection; per-label open counts; verify `labels.test.ts` cases for hidden ids and counts (`npm test`)

## 4. UI

- [ ] 4.1 Label chips in `TaskRow.tsx` and label editor in `TaskDetail.tsx`; verify browser flow: chip appears immediately after assigning, hidden for deleted labels
- [ ] 4.2 Label picker opened with `L` on a selected task: type-ahead, create-on-Enter, multi-select, Escape closes; shortcuts suppressed while typing; verify browser flow matching "Assign from the picker" and "Create while assigning"
- [ ] 4.3 Sidebar "Labels" group with counts, reorder, rename, recolour, delete and merge menu, duplicate marker; `g l` overview; verify browser flow matching "Rename propagates" (one outbox op) and "Merge duplicates"
- [ ] 4.4 Label view (open tasks grouped by project) wired into the router; verify browser flow: count in sidebar equals rows in the view
- [ ] 4.5 Update `?` help; `npm run build` passes with bundle growth under 6 KB gzipped; verify by comparing `dist` sizes

## 5. Integration and docs

- [ ] 5.1 Two-device browser run: create the same label name on both devices offline, reconnect, merge; rename on A while assigning on B offline; verify identical chips and counts on both devices after sync
- [ ] 5.2 README feature list and CHANGELOG under Unreleased; verify `make check` passes
