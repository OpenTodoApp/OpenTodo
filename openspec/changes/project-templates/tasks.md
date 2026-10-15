# Tasks

## 1. Tree model, planner and date shifting (design D2, D3, D4)

- [x] 1.1 Create `web/src/lib/templates.ts` with the `TemplateTree` types, `treeFromProject(id)` (live non-archived descendants, live sections, open tasks without `series_id`, subtasks nested, label ids to names, the project note when present) and `treeFromTask(id)`. Verify with vitest cases on fake-indexeddb: a project with sections, a completed task, a subtask tree with one completed child and a recurring series with an occurrence record yields the tree the spec's "Open tasks and structure" scenario expects.
- [x] 1.2 Implement `shiftDays(referenceDay, startDay)` and `shiftDue(due, days)` keeping `time` and `tz`, plus the reference-day rule (`template.day`, else UTC date of `exportedAt`, else earliest due). Verify with table tests for the three spec scenarios ("Duplicate with a start day", "Template from the website", "Keep dates") and a zoned due.
- [x] 1.3 Implement `planTree(tree, opts)` returning one `Change[]`: fresh ids, positions in tree order, labels matched by name ignoring case or created in the batch, `notes_doc` only when non-empty, no `assignee_id`, `TemplateTooLargeError` above 1,000 tasks. Verify with tests: ids are unique and never equal the source's; a label "Errand" is reused for "errand"; a 1,001-task tree is refused before any write; the batch for a 40-task project applies offline through `mutateMany` and the outbox holds every op.
- [x] 1.4 Add `duplicateProject(id, {name, parentId, startDay?})` and `duplicateTask(id, {startDay?})` to `web/src/lib/ops.ts`, the task copy placed after the original with `planMove`, the project last among its new siblings, and a convergence test: two devices (two fake databases) duplicate the same project offline, exchange ops, and both hold two complete copies plus the unchanged original. Verify with `npm test` and `npm run build` in web/.

## 2. Template files: reader and writer (design D1, D5)

- [x] 2.1 Implement `treeFromFile(doc)` (format and version check, in-file reference resolution, completed/deleted/`series_id` rows skipped, unknown fields dropped) and `summarise(tree)` (projects, sections, tasks, labels, dated and recurring counts). Verify with tests on a fixture copied from the website's `trip-planning` download and on rejection of a CSV, a `json-items` file and an export whose task names a `section_id` outside the file.
- [x] 2.2 Implement `fileFromTree(tree, {day})` with name-based in-file ids, `exportedAt`, `template.day`, used labels only, empty `reminders` and `views`, and a `download(file, name)` helper on a Blob URL. Verify with a round-trip test (`treeFromFile(fileFromTree(tree))` equals `tree`), a determinism test (same project, same file twice), and a check that the server importer accepts the file: a Go test in `internal/importer` previews a fixture written by the client test (`go test ./internal/importer/...`).
- [ ] 2.3 Document the template file in `docs/import.md` (own-export section: the optional `template.day` key, what "From a template" does with it) and the website hand-off in a short note in `docs/import-export.md`. Verify with `npm run docs:check` in web/.

## 3. Importer preview hint (design D7)

- [x] 3.1 Decode the optional `template` object in `internal/importer/profile_opentodo.go`, add `Parsed.Template` and the file-level note, and surface `template` in the preview JSON (`internal/httpapi` import preview). Tests: a template file previews as `opentodo` with the note and `template.day`; importing it twice skips every row as `exists`; an unauthenticated preview is 401. Verify with `go test ./internal/importer/... ./internal/httpapi/...`.
- [ ] 3.2 Show the hint under the detected format in `web/src/app/ImportScreen.tsx` when the preview carries `template`, with a link to the sidebar action. Verify with a component test (`importScreen.test.tsx`) and `npm run build` in web/.

## 4. Actions and dialogs (design D6)

- [ ] 4.1 Add "Duplicate…" and "Save as template…" to the project menu in `web/src/app/ProjectHeader.tsx` with a `DuplicateProjectDialog` (name defaulting to "<name> copy", parent picker, "Start on" `DateField`, task count, "A personal copy of this project" when the source is shared) and a `SaveTemplateDialog` (summary, plaintext warning for encrypted accounts, Download). Verify with component tests: a viewer can duplicate and the copy is unshared; confirming opens the copy; the download has the spec's "File contents"; an axe check passes in light and dark at 360 px.
- [ ] 4.2 Add "From a template…" beside the sidebar "+" (a two-item menu) with a `TemplateDialog`: file input, summary, "Start on" defaulting to today, parent, Create, and the "not an OpenTodo template" message naming Settings → Data → Import for other files. Verify with component tests for the "Website template", "Wrong file" and "Reusable" scenarios, keyboard-only operation, and an axe check.
- [ ] 4.3 Add "Duplicate" to the task panel ⋯ menu (`web/src/app/task-detail/TaskDetail.tsx`, or the redesigned menu if `task-detail-redesign` has landed) for `canEditTasks`, and <kbd>Shift</kbd>+<kbd>D</kbd> in `TaskListView` on the selected task, selecting the copy. Verify with tests: three open subtasks are copied below the original in the same section and the copy is selected; a viewer's key press writes nothing and the menu item is absent.
- [ ] 4.4 Add `Shift+D` ("Duplicate the selected task and its subtasks") and the project actions to `web/src/lib/shortcuts.ts`, regenerate the keyboard guide with `make docs`. Verify with the `shortcutHelp` test and `npm run docs:check`.
- [ ] 4.5 Write "Duplicate a project or task" and "Templates" in `docs/tasks-and-projects.md`, and the "Templates" section of `docs/import-export.md` (download from open-todo.app, From a template versus Import, what a copy carries and what it leaves out), with help ids for the dialogs. Verify with `npm run docs:check` in web/.

## 5. Integration

- [ ] 5.1 Manual smoke on `make dev`: save "Trip to Rome" as a template, start it on another day in a second account, duplicate it offline on a phone profile and confirm the copy appears on the laptop after sync; drop the same file on the Import screen and confirm the hint and the one-time import; start the website's `gtd-setup` download and confirm two projects and six labels exist once. Record the result in the change folder notes.
- [ ] 5.2 Run `make check` (go test, web test and build, ui lint, docs check). Verify it passes.

## Workflow follow-up

- Add a CHANGELOG.md entry under Unreleased ("Project templates and duplication": duplicate a project or task tree, save as template, From a template, the `template.day` key).
- Tell the website repository that `toExport` may add `template.day` and that template pages can point to "From a template" (a website change, not this one).
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
