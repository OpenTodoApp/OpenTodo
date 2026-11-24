# Tasks

## 1. Web app

- [x] 1.1 `IconPicker`: cells are `touch-target` with the column's width on touch, the grid takes `TOUCH_GRID` (exported from `web/src/ui`), and the arrow keys use the columns read from the drawn grid. Verify: `npx vitest run src/ui/IconPicker.test.tsx` (Down moves by seven on a grid drawn seven wide; the cells and the grid carry the touch classes; the existing keyboard tests still pass with eight).
- [x] 1.2 `ColourSwatches` takes `TOUCH_GRID`; `ColourPicker` shows six swatches to a row on touch. Verify: `npx tsc --noEmit`, `npx eslint` on the changed files, `npx vitest run src/app/sidebarAppearance.test.tsx`.
- [x] 1.3 The sheet's inset: the picker and the swatches pad themselves in a sheet; `SidebarAppearance` and the workspace's icon menu add the menus' 8 px there. Verify: the browser run in 2.1.
- [x] 1.4 First load within budget. Verify: `cd web && npm run build && cd .. && node scripts/bundle-budget.mjs` (entry chunk 146.0 KB of 147, entry and static imports 706.5 KB of 708).
- [x] 1.5 The whole suite. Verify: `cd web && npm test`.

## 2. Checks in a browser

- [x] 2.1 Built app, seeded account, Chromium at 360 and 390 px with touch: the new project's Appearance sheet, the new label's Colour sheet, a project menu's Icon step and its swatches. Verify: every icon and swatch box at least 44 × 44 px and no two intersecting (412 icons, 13 swatches); seven columns, icons and swatches both 20 to 340 px at 360 px and 20 to 370 px at 390 px; the field 16 to 344 px (16 to 374 px) inside the 360 px (390 px) sheet; `scrollWidth` equal to `clientWidth` on the sheet, its scroller, the icon list and the page; the field unfocused and focus on the sheet.
- [x] 2.2 At 1280 px with a mouse the same four places are where they were: 36 px cells in eight columns (21 to 330 px in the new project's panel), 20 px swatches, the field's box and focus unchanged. Verify: the same run before and after, box by box.
- [x] 2.3 The audit's M7 on the screen: `ONLY=sidebar-new-project-appearance,sidebar-new-label-colour WIDTHS=360 THEMES=light LANGS=en node scripts/ux-audit/tour.mjs`. Verify: 15 findings before on the new project's sheet (the tour of main), 0 after; the label's sheet 0 before and after.
- [x] 2.4 The theme editor's swatch grid with the built CSS in a sheet-wide box with touch: six columns, 51 px squares at 360 px, 56 px at 390 px, 44.3 px in a 320 px panel; nine columns with a mouse. Verify: measured on the grid's markup, not in the theme editor (the seeded account has no custom theme).
- [ ] 2.5 The workspace's icon menu (Settings, Workspaces, Choose icon) on a phone: the field 16 px from both edges, seven columns. Not opened in the browser run (the phone's settings layout was not reached by the script).
- [ ] 2.6 On a phone, in the Android and the iOS app: pick an icon and a colour for a new project, a section and a saved view with a thumb; the theme editor's swatches.

## 3. Docs and release

- [x] 3.1 `docs/design-system.md` (a grid of choices on touch, the sheet's inset). Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Fixed/phone-icon-picker.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [x] 3.3 Re-baseline the phone-width UI screenshots that show the icon picker or the palette swatches with touch (the sidebar's new project and new label sheets, a project's menu with its swatches and its Icon step), and the icon picker and colour field stories where they are captured with a coarse pointer. Done: green on main, CI run 44897180907 at 6e62dbd69 (21 Nov), which runs this check.

---

Shipped in 1.5.0; device check moved to the owner's list (the board task "Owner: device checks from shipped changes").
