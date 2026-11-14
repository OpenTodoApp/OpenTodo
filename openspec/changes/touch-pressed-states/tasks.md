# Tasks

## 1. Pressed states

- [x] 1.1 Add the `press-*` and `press-inset` utilities and the row's pressed rule to `web/src/index.css`; keep the generic dim as the fallback. Verify: `npx vitest run src/ui/tokens/pressed.test.ts`.
- [x] 1.2 Name the pressed colour on the tabs and the add button (`TabBar.tsx`), `MenuItem` (selected, soft danger for a destructive item), `SidebarItem`, and the row's checkbox, Show details, subtask chevron and grip (`TaskRow.tsx`, with `press-inset`). Verify: `npx vitest run src/app/tabBar.test.tsx src/ui/Menu.test.tsx src/ui/patterns/Sidebar.test.tsx src/app/taskRow.test.tsx`; `npx vitest run src/ui/tokens` (the token lint finds no raw colour or radius).

## 2. Tab height

- [x] 2.1 Find why the tabs are 44 px on touch (measured: the unlayered 44 px button rule beats the layered `min-h-14`) and give the tab bar and the cold-start skeleton `TAB_HEIGHT` (`min-h-14!`) from `phoneFrame.tsx`. Verify: `npx vitest run src/app/phoneFrame.test.tsx src/app/tabBar.test.tsx`.
- [x] 2.2 `touchFeel` in `scripts/ux-audit/measure.mjs` fails on a tab under 48 px unless the bar is minimised. Verify: `node --test scripts/ux-audit/measure.test.mjs`.

## 3. In a browser

- [x] 3.1 Built app with the layout check's seeded account, Chromium, 360 px, touch, light and dark: force `:active` through CDP on a tab, the add button, a menu item, a drawer row, the row's checkbox, Show details and grip, and the row's body; read the computed background and opacity before and after the change. Verify: the table in `design.md` (a token colour at opacity 1 after, opacity 0.6 before; the row untinted under a pressed checkbox).
- [x] 3.2 Tab height before and after at 360 px with touch, and with a mouse. Verify: 44 px before and 56 px after on touch; 56 px both times with a mouse, where a forced `:active` changes nothing.
- [x] 3.3 Screenshots of each forced state at deviceScaleFactor 1. Verify: the checkbox's and chevrons' colour does not cover the title; the tab bar's top edge meets the content's reserved room.
- [ ] 3.4 The whole layout check and the UI check's screenshots (CI). Verify: `make layout-check`, `make ui-check`; re-baseline the phone-width screens and stories that show the tab bar on touch emulation.

## 4. Docs

- [x] 4.1 `docs/design-system.md` (Touch) and `docs/interface-guide.md` (the phone's bottom bar); changelog fragment `changelog.d/Changed/touch-pressed-states.md`. Verify: `make docs-check`, `node --test scripts/repo-checks.test.mjs`.

## 5. Checks

- [x] 5.1 `npx tsc --noEmit`, `npx eslint` on the changed files, `npm test` and `npm run build` in `web/`, `node scripts/ui-check.mjs`, `node scripts/bundle-budget.mjs`, `openspec validate touch-pressed-states --strict`.
- [ ] 5.2 On a phone (owner), Android and iOS apps and a phone browser: tap each tab, the add button, a menu item in a sheet, a drawer row, a checkbox and a row; each shows its colour under the finger and clears at release. Start a scroll and a swipe with the finger on a row: the row's tint does not flash in a way that distracts (if it does, remove the first line of the row's pressed rule in `index.css`). Hold a row: the hold's tint takes over.
