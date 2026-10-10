# Tasks

## 1. Data layer (web/src/lib)

- [x] 1.1 Generic `tree.ts` (`buildTree`, `descendants`, `isDescendant`, deterministic cycle breaking by newest `parent_id` clock) or extend it if `project-hierarchy` landed first; verify `tree.test.ts` for tasks: depth, orphans at top level, cycle broken identically for both op orders (`npm test`)
- [x] 1.2 `createSubtask(parentId, title)` inheriting the parent's project; verify `ops.test.ts` "subtask inherits project" (`npm test`)
- [x] 1.3 `setTaskParent(id, parentId | null)` refusing self/descendants and cross-project parents, appending last among siblings; verify `ops.test.ts` rejects a descendant and a different-project parent (`npm test`)
- [x] 1.4 Cascades: `updateTask` with `project_id` moves descendants; `setTaskCompleted(id, true)` completes open descendants; `deleteTask` tombstones descendants; reopen does not cascade; verify `ops.test.ts` "complete cascades", "reopen does not cascade", "delete cascades", "concurrent delete and edit keeps tombstone" (`npm test`)
- [x] 1.5 Progress helper `progressOf(task, tasks)` over direct non-deleted children; verify `tree.test.ts` "3/5" and live update after a remote completion op (`npm test`)
- [x] 1.6 Display-state helper marking children of missing, deleted or completed parents as top-level with breadcrumb; verify `tree.test.ts` "concurrent complete and add shows new subtask at top level" (`npm test`)

## 2. Server (Go)

- [x] 2.1 Validate `parent_id` on task create and patch (exists, not deleted, same project, no cycle) returning `invalid_input`; verify `TestTaskParentRejectsCycle`, `TestTaskParentMustShareProject`, `TestTaskParentRequiresAuth` (`go test ./...`)
- [x] 2.2 Document in `docs/api.md` and add cascade and cycle-breaking notes to `docs/sync.md`; verify error codes match handler tests

## 3. UI (web/src/app)

- [x] 3.1 Nested rendering in `TaskListView.tsx` for project and Inbox views (indentation capped at level 3, per-device collapse, Left/Right on the selected row); verify browser flow matching the "Indented tree" scenario and collapse persistence after reload
- [x] 3.2 Flat rendering with parent breadcrumb in Today, Upcoming and Completed; verify browser flow matching the "Flat in Today" scenario
- [x] 3.3 Progress badge in `TaskRow.tsx` and detail panel; verify browser flow: completing a subtask on a second device updates "3/5" to "4/5" without reload
- [x] 3.4 Detail panel: subtask list, "Add subtask" input that stays focused, "Parent task" picker with exclusions; verify browser flow matching "Add from the detail panel" and "Picker excludes descendants"
- [x] 3.5 Keyboard: `a` adds a subtask to the selected task, Tab indents, Shift+Tab outdents, Enter accepts the "complete parent too" prompt; shortcuts do not fire while typing; verify browser flow matching the Tab, Shift+Tab and "Last subtask completed" scenarios
- [x] 3.6 Update `?` help; `npm run build` passes with bundle growth under 6 KB gzipped; verify by comparing `dist` sizes

## 4. Integration and docs

- [x] 4.1 Two-device browser run: build a three-level tree on A; on B offline re-parent and complete; on A offline delete a subtree; reconnect both; verify identical trees, no task nested in itself, deleted subtree absent from views and present in export
- [x] 4.2 README feature list and CHANGELOG under Unreleased; verify `make check` passes
