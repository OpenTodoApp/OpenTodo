# Tasks

## 1. The row

- [x] 1.1 The disclosure (`[data-row-expand]` in `web/src/app/TaskRow.tsx`) is not displayed below 768 px unless the row's details are shown. Verify: `npx vitest run src/app/task-list/rowExpand.test.tsx` (below 768 px no disclosure, → expands and Hide details closes, a tap opens the task; from 768 px on touch the disclosure toggles).
- [x] 1.2 The fold arrow's touch target ends where the checkbox's begins, with its own pressed circle; the grip takes 4 px of margin at the row's end; the disclosure stands 12 px from the grip. Verify: `npx vitest run src/app/taskRow.test.tsx` ("each have a target of their own").
- [x] 1.3 `web/src/index.css`: the grip joins the phone row's first line; a row with a fold arrow draws normally on touch; comments of the phone row and `press-inset`. Verify: `npx vitest run src/app/fullTitles.test.tsx src/ui/tokens`.

## 2. The add field

- [x] 2.1 `placeholderFor(..., short)` and the section's add line give "Add a task…" below 768 px. Verify: `npx vitest run src/app/task-list/listChrome.test.tsx` ("the add field hint"); `node scripts/i18n-check.mjs` (no new string).

## 3. The audit

- [x] 3.1 M11 does not compare fixed chrome with content that scrolls under it (`scripts/ux-audit/audit-measures.mjs`). Verify: `node --test scripts/ux-audit/measure.test.mjs`.

## 4. In a browser

- [x] 4.1 The tour on the built app before and after. Verify: `ONLY=inbox,today,project,upcoming WIDTHS=360,390,768 THEMES=light LANGS=en node scripts/ux-audit/tour.mjs` reports no M11 (before: 6, 5, 8, 1 at 360 px and 6, 8, 8, 1 at 390 px, capped at 8 a screen).
- [x] 4.2 Chromium, 360 and 390 px, touch, seeded account. Verify: the fold arrow, the checkbox and the grip each answer a tap at their centre and at their edges and nothing else does; a tap on the title opens the task; a swipe right completes; a hold opens the menu; the pressed circles are 28 px in the selected colour (forced `:active`); the add field reads "Add a task…" on one line (44 px tall).
- [x] 4.3 Wider. Verify: at 768 px on touch every row has its disclosure and no control overlaps; at 1280 px with a mouse the hovered row shows Show details, Schedule, Priority and More; a row expanded at 900 px keeps Hide details when the window narrows to 600 px.
- [x] 4.4 Layout check of the list screens. Verify: `ONLY=today,inbox,upcoming,project,label,filter,saved-view,assigned,completed ENGINES=chromium WIDTHS=360,390,768 node scripts/e2e-layout.mjs` against a fresh server prints `LAYOUT OK`.
- [ ] 4.5 The whole layout check with its WebKit leg and the UI check's screenshots (CI). Verify: `make layout-check`, `make ui-check`; re-baseline the phone-width screens and stories with task rows (no arrow, the grip level with the title) and touch rows from 768 px.

## 5. Docs

- [x] 5.1 `docs/expand-a-row.md`, `docs/interface-guide.md`, `docs/design-system.md`; changelog fragment `changelog.d/Changed/phone-row-controls.md`. Verify: `make docs-check`, `node --test scripts/repo-checks.test.mjs`.

## 6. Checks

- [x] 6.1 `npx tsc --noEmit`, `npx eslint` on the changed files, `npm test` and `npm run build` in `web/`, `node scripts/bundle-budget.mjs`, `openspec validate phone-row-controls --strict`.
- [ ] 6.2 On a phone (owner): in the Android and iOS apps, fold a task's subtasks with a thumb and complete the task beside it; drag a row by its grip under a section header; the pressed circle under the fold arrow; a project of 50 tasks or more, where the fold arrow takes taps from the row's edge only (design D2).
