## 1. Verify in a browser (390×844 and 360 px, touch)

- [x] 1.1 The add button and the last rows: measured on every screen with the button, scrolled to its end. Nothing to fix (design D1).
- [x] 1.2 Settings fields on touch: all 59 pages measured, no control under 44 px. Nothing to fix (design D2).
- [x] 1.3 Settings → AI assistants: the page does not scroll sideways, Copy configuration copies. Nothing to fix (design D3).

## 2. Fixes

- [x] 2.1 Notes: From template… is the first item of the page's menu below 768 px. Verify: `notesPage.test.tsx` "From template on a phone" and "From 768 px the page menu has no From template item"; tapped at 390 px.
- [x] 2.2 Routines: below 640 px Run now is the row menu's item only. Verify: `routines.test.tsx` "Narrow row"; a screenshot at 360 px.
- [x] 2.3 Statistics: the heatmap, the weekday and hour grid and a chart's table fade where they continue; `useScrollEdges` reads a row that starts at its right end. Verify: `statsView.test.tsx` "a chart or table wider than the screen fades at the edge where more is hidden", `surfaces.test.tsx` (tab rows unchanged); a finger drag at 360 and 390 px.
- [x] 2.4 Habits: the row's menu button is shown on touch. Verify: `habitsScreen.test.tsx` "never hidden on touch"; the layout check on `habits`.

## 3. Checks

- [x] 3.1 The layout check opens Next, Waiting, the Loop home, the weekly review, Close the day, the Daily check, Habits, a habit's page, Focus and a note's page; the seed has one habit and one note; the inventory names them. Verify: `node --test scripts/ux-audit/ux-audit.test.mjs` and `node scripts/e2e-layout.mjs` prints `LAYOUT OK`.
- [x] 3.2 `scripts/ux-audit/settings-heights.mjs` lists touch controls under 44 px. Verify: its output ends with "Touch controls under 44 px: 0".

## 4. Docs and checks

- [x] 4.1 `docs/note-templates.md`, `docs/routines.md` (`docs/statistics.md` is at its 600-word limit and is unchanged) and `changelog.d/Changed/phone-rest.md`. Verify: `npm run docs:build` and `npm run docs:check` in web/.
- [x] 4.2 `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` in web/; `node scripts/ui-check.mjs`, `node scripts/i18n-check.mjs`, `node scripts/bundle-budget.mjs`, `openspec validate --all --strict`.
