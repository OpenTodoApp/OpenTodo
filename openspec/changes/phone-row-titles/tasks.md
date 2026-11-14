# Tasks

## 1. The row

- [x] 1.1 Remove the phone row's one-line clamp in `web/src/index.css` and put its end cell on the title's first line; delete the copy of that rule under Show full task titles. Verify: `npx vitest run src/app/fullTitles.test.tsx` (the phone block has no clamp, the cell rule and the 44 px rules are there).
- [x] 1.2 Update the comments that describe a one-line phone row (`index.css`, `taskRow.stories.tsx`, `lib/fullTitles.ts`, `scripts/ui-check/alignment.spec.ts`). Verify: `grep -rn "one-line clamp\|keeps one line" web/src scripts` finds nothing.

## 2. In a browser

- [x] 2.1 Built app with the layout check's seeded account, Chromium, 360 and 390 px, touch: Today, Inbox, Upcoming and a project before and after. Verify: long titles take two lines and then end with an ellipsis, short titles and their rows are unchanged, no two parts of a row overlap, the checkbox target is 44 × 44 px, and at 768 and 1280 px no row changed.
- [x] 2.2 Complete a two-line row with its checkbox, swipe it, drag it by its grip to another section and open it by its second line at 360 px. Verify: each does what it does on a one-line row, and the swipe edge is as tall as the row.
- [x] 2.3 Layout check of the list screens. Verify: `ONLY=today,inbox,upcoming,project,label,filter,saved-view,assigned,completed,triage,dashboard,trash ENGINES=chromium WIDTHS=360,390 node scripts/e2e-layout.mjs` against a fresh server prints `LAYOUT OK`.
- [ ] 2.4 The whole layout check with its WebKit leg, and the UI check's screenshots (CI). Verify: `make layout-check`, `make ui-check`; re-baseline the phone-width row stories and screens whose titles now take two lines.

## 3. Docs

- [x] 3.1 `docs/row-layouts.md` and `docs/interface-guide.md` say two lines on a phone; changelog fragment `changelog.d/Changed/phone-row-titles.md`. Verify: `make docs-check`, `node --test scripts/repo-checks.test.mjs`.

## 4. Checks

- [x] 4.1 `npx tsc --noEmit`, `npx eslint` on the changed files, `npx vitest run` for the row tests, `npm run build` in `web/`, `openspec validate phone-row-titles --strict`.
- [ ] 4.2 On a phone (owner): Today and the Inbox in the Android and iOS apps; a 2,000-task project scrolls to its end; dragging a two-line row by its grip lands where the line shows.
