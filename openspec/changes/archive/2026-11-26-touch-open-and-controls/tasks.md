# Tasks

## 1. The four fixes

- [x] 1.1 Updates: a tap opens a row on a coarse pointer, not on its own controls (design D1, D2). Verify: `npx vitest run src/app/workspaceActivity.test.tsx` passes unchanged.
- [x] 1.2 Habits: the check-in menu and the pencil visible on a coarse pointer (D3). Verify: `npx vitest run src/app/habitsScreen.test.tsx` passes unchanged.
- [x] 1.3 Timeline: Earlier, Today, Later (D4). Verify: `npx vitest run src/app/timelineView.test.tsx src/app/touchKeyboardHints.test.tsx` passes unchanged; `node scripts/i18n-check.mjs` (no new string).
- [x] 1.4 Labels: the handle's size by touch. Verify: `npx vitest run src/app/labelsView.test.tsx` passes unchanged.

## 2. Tests

- [x] 2.1 Tests for every scenario: `feedView.test.tsx` (new, 5: a tap opens the task, the project inside the row, an entry without a task, a mouse), `habits/habitsScreen.test.tsx` and `habits/habitNotes.test.tsx` (the controls' classes: happy-dom applies no CSS), `timelineView.test.tsx` (4: the three buttons, a week in Days, four in Weeks, the keys). Verify: 67 pass in the seven files; each touched file three times in a row.

## 3. Checks

- [x] 3.1 `npm test` in `web/` (953 files, 11,015 tests pass) and the build, `ui-check`, docs build and check, repo checks, `openspec validate --all --strict`; the layout check in Chromium over the whole inventory: `LAYOUT OK` (2026-11-26).
- [x] 3.2 In a real browser at 390 px with touch on a seeded server: the main pointer is coarse, a tap on a feed row opens the task page, no console error (done 2026-11-26). Not seen there: the habit menu (the seeded account has no habit; the class is tested) and the timeline's buttons (tested in `timelineView.test.tsx`; the layout check opens the timeline).

## 4. Release note

- [x] 4.1 `changelog.d/Fixed/touch-open-and-controls.md`. Verify: `make docs-check`.
