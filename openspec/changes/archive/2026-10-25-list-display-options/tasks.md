## 1. Data

- [x] 1.1 Additive op fields `project_prefs.group_by|sort_by|sort_dir` and `label.group_by|sort_by|sort_dir` in `internal/sync/ops.go`, the schema fixture, `types.ts` and the defaults in `ops.ts`; verified by `go test ./internal/sync/` and `schemaFixture.test.ts`
- [x] 1.2 `sort_by: "deadline"` for views (REST validation, `compareTasks`); verified by `listDisplay.test.ts` ("compareTasks by deadline") and `go test ./internal/httpapi/`
- [x] 1.3 `lib/listDisplay.ts`: options, defaults, read-time fallback, writes as ops; verified by `listDisplay.test.ts`

## 2. Lists

- [x] 2.1 `listGroups`: grouping and order of a project's top-level tasks (sections kept, subtasks under parents, Later at the end) and of a label page; each task once; verified by `listDisplay.test.ts`
- [x] 2.2 The display panel with the parts a page has, in the project (List layout) and label headers and the phone bar; verified by `listDisplayPanel.test.tsx`
- [x] 2.3 A drag among rows or an Alt+arrow move under another order switches to manual order first; verified by `listDisplayPanel.test.tsx` (keyboard move)

## 3. Docs and checks

- [x] 3.1 `docs/projects.md`, `docs/labels-and-filters.md`, `docs/filters.md`, `docs/api.md`, `docs/sync.md`, CHANGELOG
- [x] 3.2 `make check`
