# Tasks

## 1. One resolver on both sides

- [x] 1.1 Add `applicableFields(projectId, projects, defs)` and a per-render lookup to `web/src/lib/fieldTree.ts`, re-exported by `fields.ts` (design D1). Verify: `cd web && npm test -- fields`.
- [x] 1.2 Add `ApplicableFields` and `FieldDescendants` to `internal/sync/fields.go` (design D1). Verify: `go test ./internal/sync -run Field`.
- [x] 1.3 Write the shared vectors `web/src/lib/fields.vectors.json`: own fields, parent, grandparent, deleted definition, deleted parent, missing parent, cycle, Inbox, position tie. Read them in `internal/sync/fields_vectors_test.go` and `web/src/lib/fields.test.ts`, and add the row to `docs/contracts.md`. Verify: both tests pass, and `node --test scripts/contracts.test.mjs` passes.

## 2. The web app follows inheritance

- [x] 2.1 The panel (`FieldsGroup`), the columns layout (`useListModel`, `FieldColumns`) and the badges (`fieldBadges`, `TaskRow`) use the applicable fields. Verify: a test in `web/src/app/task-detail` shows a parent's field on a sub-project task and writes its value under the parent's id; `npm test -- fieldsList FieldsGroup`.
- [x] 2.2 Filter terms use the applicable set (`lib/filter/evaluate.ts`). Verify: evaluate tests for `wsjf >= 5` and `no wsjf` on a grandchild's task.
- [x] 2.3 Definition checks in `lib/fields.ts`:
  - names are checked against inherited fields and descendants' fields;
  - the limit counts inherited fields, also for descendants;
  - an option rename rewrites tasks in descendant projects;
  - `countValues` covers the subtree.

  Verify: unit tests for each rule, including the messages naming the project.
- [x] 2.4 `FieldsDialog`:
  - inherited fields first, grouped under "From *Parent*", read-only;
  - a clash note on the project's own fields;
  - the sharing note on a shared sub-project.

  Verify: `fieldsDialog.test.tsx` cases, `npm run build`, `make i18n-check` (new strings translated in de, es, fr, it, pt).

## 3. Server and tools follow inheritance

- [x] 3.1 `internal/httpapi/fields.go`:
  - `checkTaskFields` accepts the applicable fields;
  - `checkField` applies the tree's name and limit rules, with errors naming the project.

  Verify: httpapi tests: an inherited value is 200; an unrelated project's field is 400; a parent-name clash, a sub-project clash and the tree limit are 400 naming the project; an unauthenticated request is 401.
- [x] 3.2 `internal/agenttools/data.go`: `list_projects` shows inherited fields with `inherited_from`, and values and patches use the applicable set. Verify: agenttools tests; the golden files are updated only if the tool list itself changed.
- [x] 3.3 `internal/timetrack/csv.go` columns use the applicable fields, with the projects' parents passed in by `internal/httpapi/timeentries.go`. Verify: a timetrack CSV test with an inherited field.

## 4. Docs and release

- [x] 4.1 `docs/custom-fields.md`: a short "Fields of sub-projects" section, staying under the page's word limit. Then regenerate the in-app help. Verify: `npm run docs:check`.
- [x] 4.2 Add a CHANGELOG entry under Unreleased (Closes #405), and add `inherited-custom-fields` to the custom-fields ROADMAP rows. Verify: `npm run docs:check`, `make openspec-validate`.
- [x] 4.3 Run the full checks: `go test ./...`, `cd web && npm test && npm run build`, `make openspec-validate`. CI runs `make check`. Verify: all pass.
- [x] 4.4 After the PR is merged, reply on issue #405 with a short, friendly note: thank szabyg for the detailed proposal, and explain how inheritance works, including the name rule in both directions and the sharing behaviour. Link the PR and the docs, name the next release, then close the issue. Verify: `gh issue view 405 -R OpenTodoApp/OpenTodo` shows the comment and the state CLOSED.
