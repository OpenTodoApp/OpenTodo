# Tasks

## 1. Data layer (web/src/lib)

- [x] 1.1 Add tree helpers: `buildProjectTree(projects)` returning ordered nodes with depth, `descendantIds(id)`, `isDescendant(a, b)`; verify with new `tree.test.ts` cases for three levels, orphan parents shown at top level (`npm test`)
- [x] 1.2 Implement deterministic cycle breaking in the tree builder (member with newest `parent_id` clock becomes top level, no op written); verify `tree.test.ts` "concurrent moves form a cycle" produces identical output for both op orders (`npm test`)
- [x] 1.3 Add `moveProject(id, parentId | null)` that refuses self/descendant targets and appends the project last among siblings via `position`; verify `ops.test.ts` rejects a descendant target and sets `parent_id` through `mutate` (`npm test`)
- [x] 1.4 Extend `archiveProject` to cascade `archived=true` to descendants (one op each) and `deleteProject` to promote direct sub-projects to the deleted project's parent; verify `ops.test.ts` cases "archive cascades" and "delete promotes sub-projects" (`npm test`)
- [x] 1.5 Rolled-up open counts: `openCountsByProject(tasks, tree, collapsed)`; verify `tree.test.ts` "collapsed parent shows subtree total, expanded shows own" (`npm test`)
- [x] 1.6 Per-device collapse state in `meta` (`collapsedProjects`), with ancestor auto-expand on navigation; verify `tree.test.ts` persistence round trip through `getMeta`/`setMeta` (`npm test`)

## 2. Server (Go)

- [x] 2.1 Cycle check on `PATCH /api/v1/projects/{id}` when `parent_id` is present (walk parent chain in materialized fields, reject self or descendant with `invalid_input`); verify `TestProjectPatchRejectsCycle` and `TestProjectPatchParentRequiresAuth` (`go test ./...`)
- [x] 2.2 Document the validation in `docs/api.md` and the cycle-breaking rule in `docs/sync.md`; verify the documented error code matches the handler test

## 3. Sidebar and views (web/src/app)

- [x] 3.1 Render the project tree in `Sidebar.tsx` with indentation capped after level 3, collapse chevrons, Left/Right keyboard toggling on focused rows; verify browser flow: three-level tree renders, Left hides children, state survives reload on the same device
- [x] 3.2 "Move to" picker in `ProjectHeader.tsx` (excludes self, descendants, archived, deleted; offers "Top level"), reachable via keyboard; verify browser flow: moved project appears last under the new parent; descendants are absent from the picker
- [x] 3.3 Create-project form accepts an optional parent and defaults to the current project; verify browser flow: project created inside "Work" appears nested and "Work" is expanded
- [x] 3.4 "Sub-projects" section at the bottom of the project view with rolled-up counts; quick add keeps adding to the parent only; verify browser flow matching the "Sub-project list" scenario
- [x] 3.5 Update `?` shortcut help with Left/Right and the Move action; verify the help dialog lists them (browser flow)
- [x] 3.6 `npm run build` passes and the gzipped bundle grows by less than 4 KB; verify by comparing `dist` sizes before and after

## 4. Integration

- [x] 4.1 Two-device browser run: move a project offline on A, move the other direction on B, reconnect both; verify both sidebars are identical, no project is nested inside itself, all tasks reachable
- [x] 4.2 Update README feature list and CHANGELOG under Unreleased; verify `make check` passes
