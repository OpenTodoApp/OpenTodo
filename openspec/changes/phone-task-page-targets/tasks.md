# Tasks

## 1. The page

- [x] 1.1 On a coarse pointer the completion circle's target starts at the top of the title's first line (`web/src/app/task-detail/TaskHead.tsx`). Verify: `npx vitest run src/app/task-detail/panelProportions.test.tsx` ("the circle's 44 px target starts at the top of the title's first line").

## 2. The audit

- [x] 2.1 M11 treats a stuck sticky element as pinned chrome (`scripts/ux-audit/audit-measures.mjs`). Verify: `node --test scripts/ux-audit/measure.test.mjs` (a stuck bar over content passes, a sticky bar at its place over a control fails, two stuck bars on each other fail).

## 3. In a browser

- [x] 3.1 The tour on the built app before and after. Verify: `ONLY=task,task-panel,panel-comments WIDTHS=360,390 THEMES=light LANGS=en node scripts/ux-audit/tour.mjs` reports no finding (before: M11 5, 5 and 0 at 360 px).
- [x] 3.2 Chromium, 360 and 390 px, touch, seeded account. Verify: the boxes of design "Context"; Back and the circle each answer a tap at their centre and at their edges and do their own thing; each tab is selected by a tap; the comment field opens; scrolled to the end the field is under the tabs.
- [x] 3.3 1280 px with a mouse. Verify: the completion control is 24 px, centred on the title's line; no M11.
- [ ] 3.4 The whole layout check with its WebKit leg and the UI check's screenshots (CI). Verify: `make layout-check`, `make ui-check`; no baseline is expected to change.

## 4. Docs

- [x] 4.1 `docs/interface-guide.md`, `docs/design-system.md` (M11); changelog fragment `changelog.d/Fixed/phone-task-page-targets.md`. Verify: `make docs-check`, `node --test scripts/repo-checks.test.mjs`.

## 5. Checks

- [x] 5.1 `npx tsc --noEmit`, `npx eslint` on the changed files, `npm test` and `npm run build` in `web/`, `node scripts/bundle-budget.mjs`, `openspec validate phone-task-page-targets --strict`.
- [ ] 5.2 On a phone (owner): in the Android and iOS apps, open a task, tap the top of its circle with a thumb (it completes, the page stays) and the bottom of Back (the list returns); on a task with no comments tap each tab above the comment field.
