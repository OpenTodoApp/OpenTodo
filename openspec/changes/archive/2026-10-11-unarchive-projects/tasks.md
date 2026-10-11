# Tasks

## 1. Data layer

- [x] 1.1 `archivedProjects()` and `unarchiveProject()` in `web/src/lib/archive.ts` (restore through `updateProject` → `mutate()`, add to the per-device skip list; `undoAutoArchive` shares it); verify unit tests in `web/src/lib/archive.test.ts` for listing, sorting, restoring one project of a subtree, the pending op and the skip list (`npm test`)

## 2. Settings

- [x] 2.1 "Archived projects" list with Restore buttons in Settings → Projects (`web/src/app/SettingsView.tsx`): parent name, open count, empty state, disabled Restore with a note for roles that cannot archive, accessible names, focus kept after restore; verify a render test (`web/src/app/archivedProjects.test.tsx`), `npm test` and `npm run build` in web/

## 3. Docs and checks

- [x] 3.1 Describe the button in `docs/trash-and-history.md`, `docs/tasks-and-projects.md` and `docs/settings.md`; `make docs`; verify `npm run docs:check`
- [x] 3.2 CHANGELOG entry under Unreleased (Added); verify `make check` and `openspec validate --all --strict`
