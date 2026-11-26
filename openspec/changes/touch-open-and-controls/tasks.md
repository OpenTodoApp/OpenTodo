# Tasks

## 1. The four fixes

- [x] 1.1 Updates: a tap opens a row on a coarse pointer, not on its own controls (design D1, D2). Verify: `npx vitest run src/app/workspaceActivity.test.tsx` passes unchanged.
- [x] 1.2 Habits: the check-in menu and the pencil visible on a coarse pointer (D3). Verify: `npx vitest run src/app/habitsScreen.test.tsx` passes unchanged.
- [x] 1.3 Timeline: Earlier, Today, Later (D4). Verify: `npx vitest run src/app/timelineView.test.tsx src/app/touchKeyboardHints.test.tsx` passes unchanged; `node scripts/i18n-check.mjs` (no new string).
- [x] 1.4 Labels: the handle's size by touch. Verify: `npx vitest run src/app/labelsView.test.tsx` passes unchanged.

## 2. Tests

- [ ] 2.1 Tests for the scenarios of the three requirements (the feed by touch and with a mouse, the tap on the project inside a row; the habit controls' classes; the timeline's three buttons). Verify: they pass three times in a row.

## 3. Checks

- [ ] 3.1 `npm test` and `npm run build` in `web/`, `make ui-check`, `make docs-check`, `openspec validate --all --strict`; the layout check in Chromium (`timeline`, `updates`, `labels`). Verify: all pass, `LAYOUT OK`.
- [ ] 3.2 In a real browser at 390 px with touch: a tap opens a feed row; the habit menu is visible; Later moves the timeline. Verify: screenshots looked at.

## 4. Release note

- [ ] 4.1 `changelog.d/Fixed/touch-open-and-controls.md`. Verify: `make docs-check`.
