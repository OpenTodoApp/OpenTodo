# Tasks

## 1. Preference

- [x] 1.1 Add `add_position` (string, default `""`) to the `user_prefs` schema in `internal/sync/ops.go` with a comment (values, unknown reads as bottom), regenerate the op schema for `web/src/lib/types.ts`, add the default to `USER_PREFS_DEFAULTS` in `web/src/lib/ops.ts`, and update `internal/sync/testdata/schema_fixture.json`; verify `go test ./internal/sync/...` and `npm test -- schemaFixture`
- [x] 1.2 Add `readAddPosition(row)` to `web/src/lib/userPrefs.ts` (empty or unknown → bottom, stored value kept) and a setter writing through `mutate`; verify in `web/src/lib/prefs.test.ts`
- [x] 1.3 Add the "Add new tasks" choice card to Settings → Capture → Quick add (`web/src/app/QuickAddSettings.tsx`) with the help line, register it in settings search; verify with a happy-dom test that choosing "top" writes the op and survives a reload

## 2. Placement

- [x] 2.1 Give `planTask` a `placement: 'top' | 'bottom'` and add `topTaskPosition` (one indexed read of the smallest position, minus `GAP`, a block of increasing positions for a batch) in `web/src/lib/ops.ts`; verify in `web/src/lib/ops.test.ts` that a top task sorts first in a project, a section and the Inbox, a three-task batch keeps its order at the top, and bottom is unchanged
- [x] 2.2 Pass the preference from `TaskListView` (project and Inbox), `SectionQuickAdd` (list and board), the command bar and `QuickAddSheet` when the target list is manual; leave subtasks, the `o` anchor, duplicates and templates unchanged; verify with tests in `web/src/app/task-list` for each entry point and that `o` still inserts after the anchor
- [x] 2.3 Verify convergence: a sync test with two devices adding at the top offline yields the same order on both (`web/src/lib/sync.test.ts`)

## 3. Reachable quick add

- [x] 3.1 Make the list page's quick add wrapper sticky under the sticky page header from 768 px where phone chrome is off, with matching scroll padding so focused rows are not covered; verify with a happy-dom test for the class switch and in the built app at 1280 × 800 (scroll an 80-task project, add without scrolling) and at 390 × 844 (unchanged)
- [x] 3.2 Show the "Added to the bottom/top of {list}" toast with Show when the new row is outside the visible area (Inbox's left-the-Inbox note wins); verify with a test that mocks the row's visibility, and that no toast appears for a visible row

## 4. Strings, docs, contracts

- [x] 4.1 Extract and translate the new strings in the five other languages (`node scripts/i18n/extract.mjs --write`, `web/src/locales/*.json`); verify `make i18n-check`
- [x] 4.2 Document the preference and the sticky quick add in `docs/quick-add.md` and `docs/group-and-order.md`, and in `docs/api.md` that REST and MCP creates append unless a `position` is given; verify `make docs-check`
- [x] 4.3 Run `make ui-check`, `npm test` and `npm run build` in `web/`, `go test ./...`; add the CHANGELOG entry under Unreleased when archiving
