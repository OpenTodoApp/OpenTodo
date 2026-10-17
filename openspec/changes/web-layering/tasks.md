# Tasks

## 1. Design system stands alone (UI-12)

- [x] 1.1 Move `web/src/app/overlay` to `web/src/ui/overlay`, export it from the `web/src/ui` barrel, and point screens at the barrel (`npx tsc -b`, `barrel.test.ts`)
- [x] 1.2 Move the help request store to `web/src/lib/helpRequest.ts` (help tests in `app/help/help.test.tsx`)
- [x] 1.3 Keep `web/src/app/overlay` as a re-export for the four files of `web-component-structure` only
- [x] 1.4 Workbench stories for the overlay pieces (`ui/overlay/Overlay.stories.tsx`, a11y-checked, tag no-visual until `make ui-baselines`; `make ui-lint`)
- [x] 1.5 ESLint refuses `src/app` imports in `src/ui` (`src/layering.test.ts`, `npm run lint`)

## 2. Screens read local data through src/lib (UI-13)

- [x] 2.1 `web/src/lib/liveSnapshot.ts` (shared snapshot) and `liveTasks.ts` on top of it (`npm test`)
- [x] 2.2 `web/src/lib/localData.ts` hooks and the one visibility rule for projects; move every screen in `web/src/app` off `lib/db` except the four files of `web-component-structure` (`npx tsc -b`, `npm run lint`)
- [x] 2.3 ESLint refuses `lib/db` imports (except the lifecycle calls) and `db.` in `src/app`, with the four files allow-listed as "cleared by web-component-structure" (`src/layering.test.ts`)

## 3. One entity table registry (DATA-8)

- [x] 3.1 Every former copy uses `tableOf`/`syncedTables` with no default; `undo.ts` no longer re-exports it (`npx tsc -b`)
- [x] 3.2 `web/src/lib/entityTables.test.ts` fails on an entity kind without a table, a fallback table, or a second mapping

## 4. Checks

- [x] 4.1 `npm test` (twice), `npm run lint`, `npm run build`, `make ui-lint`, `make i18n-check`, Chromium layout, smoke and views checks against a fresh server
