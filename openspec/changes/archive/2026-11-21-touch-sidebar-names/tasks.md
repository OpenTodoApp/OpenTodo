# Tasks

## 1. The rows

- [x] 1.1 `web/src/index.css`: on a coarse pointer the menu button of a `data-menu-row` inside the sidebar's scroller stands at the row's end, unpainted and without pointer events until `:focus-visible`; the hold's tint. Verify: `npx vitest run src/app/rowMenuHold.test.tsx` ("the styles").
- [x] 1.2 `web/src/app/rowMenuHold.ts`: `holdForRowMenu` on the scroller; the rows of projects, labels, views, favourites and pinned notes carry `data-menu-row`. Verify: `npx vitest run src/app/rowMenuHold.test.tsx` (a hold arms, tints and opens the menu without opening the row; a tap, a scroll, a mouse, a destination and a group heading open nothing).

## 2. The foot

- [x] 2.1 `ui-whole` in `web/src/index.css`; the account name in `SidebarFooter.tsx` uses it. Verify: `npx vitest run src/app/sidebarFooter.test.tsx src/app/rowMenuHold.test.tsx`.
- [x] 2.2 `SyncStatus.tsx`: no words while syncing on touch, the other words in `ui-whole`, the control able to narrow to 44 px. Verify: `npx vitest run src/app/SyncStatus.test.tsx` ("words on touch").

## 3. The audit

- [x] 3.1 M11 compares boxes cut to their scroll containers and skips a stuck element against content scrolling under it in the same pinned layer (`scripts/ux-audit/audit-measures.mjs`). Verify: `node --test scripts/ux-audit/measure.test.mjs` ("compared by the part of its box inside its scrollers").
- [x] 3.2 The layout check opens a sidebar view's menu from the keyboard (`scripts/ux-audit/layout-screens.mjs`), and its touch-target rule leaves out a control with `pointer-events: none` (`smallTargets` in `scripts/ux-audit/measure.mjs`; one that takes taps while invisible still fails). Verify: `node --test scripts/ux-audit/measure.test.mjs` ("touch targets"); `ONLY=inbox,labels,views ENGINES=chromium WIDTHS=360,390,768 node scripts/e2e-layout.mjs` against a fresh server prints `LAYOUT OK`.

## 4. In a browser

- [x] 4.1 Chromium with touch on the seeded account, every group open, before and after. Verify: characters shown of "Home renovation with a rather long project name" 9 → 16 at 768 px, 17 → 25 at 360 px, 11 → 19 at 320 px; of the favourite and the view "Deep work and everything else that matters" 21 → 28, 29 → 36, 23 → 31; the other names were whole and stay whole.
- [x] 4.2 Every kind of row (favourite, project, label, view) at 320, 360 and 768 px. Verify: the menu button is 44 by 44 px with opacity 0 and no pointer events; a hold tints the row and a release opens its menu with the address unchanged; Tab from the row reaches the button, which shows, and Enter opens the menu.
- [x] 4.3 The foot at 320, 360 and 768 px. Verify: the name is whole at 360 px and the avatar alone at 320 and 768 px; with words put into the sync control, "Offline" shows whole everywhere, "Offline · 3 pending" whole at 360 px and the dot alone at 320 and 768 px; every control is at least 44 by 44 px and the row never overflows.
- [x] 4.4 The tour. Verify: `ONLY=sidebar,inbox WIDTHS=360,768 THEMES=light LANGS=en node scripts/ux-audit/tour.mjs`: M11 on `sidebar` at 360 px 5 → 0, on `inbox` at 768 px 0 → 0; with the Labels and Views groups open (the state the full tour is in when it reports "waiting × Schedule") 3 → 0 at 768 px and 8 → 0 at 360 px; no M7.
- [x] 4.5 A mouse. Verify: at 1280 px the sidebar's pixels are the same before and after apart from the avatar's seeded colour; the menu button shows on hover and focus.
- [ ] 4.6 On a phone and a tablet. Verify: with VoiceOver and with TalkBack the item after a project's row is "Menu for project …" and a double tap opens the menu; a hold opens the menu in the drawer and in a tablet's sidebar; after the menu closes no "⋯" stays on the row.
- [ ] 4.7 The whole layout check with its WebKit leg and the UI check's screenshots (CI). Verify: `make layout-check`, `make ui-check`; re-baseline the touch captures that show the sidebar (every screen at 768 px, the open drawer at phone widths).

## 5. Docs

- [x] 5.1 `docs/sidebar-counts-and-order.md`, `docs/design-system.md`; changelog fragment `changelog.d/Changed/touch-sidebar-names.md`. Verify: `make docs-check`, `node --test scripts/repo-checks.test.mjs`.

## 6. Checks

- [x] 6.1 Verify: `cd web && npx tsc --noEmit && npx eslint` on the changed files, `npm run build`, `node scripts/bundle-budget.mjs` (146.8 of 147 kB and 707.6 of 708 kB gzip), `node scripts/i18n-check.mjs`, `npx @fission-ai/openspec@1.13.2 validate touch-sidebar-names --strict`, and the affected tests: `npx vitest run src/app/sidebar*.test.tsx src/app/SyncStatus.test.tsx src/app/rowMenuHold.test.tsx src/app/phoneDrawer.test.tsx src/app/density.test.tsx src/app/labelsView.test.tsx src/app/favouritesMenus.test.tsx src/app/task-row-contextmenu.test.tsx src/ui/patterns src/ui/tokens src/layering.test.ts`.
- [x] 6.2 The whole suite (CI). Verify: `cd web && npm test`, `make check`. Done: green on main, CI run 44897180907 at 6e62dbd69 (21 Nov), which runs this check.

---

Shipped in 1.5.0; device check moved to the owner's list (the board task "Owner: device checks from shipped changes").
