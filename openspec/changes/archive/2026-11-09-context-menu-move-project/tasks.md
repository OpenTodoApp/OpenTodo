# Tasks

## 1. Fix

- [x] 1.1 Hold the Actions menu's review and date dialog in a module store rendered by `BulkDialogHost`, mounted in `ActionToasts` (design D1). Verify `npx vitest run src/app/bulk src/app/task-row-contextmenu.test.tsx`
- [x] 1.2 Add an interaction test: right-click a row in a project, Move to project, pick another project, Apply; the task's `project_id` is the target and the row leaves the list. Verify it fails without 1.1 and passes with it
- [x] 1.3 Add a CHANGELOG.md entry under Unreleased → Fixed (#839). Verify `npm run typecheck`, `make web-lint` and the full web suite
