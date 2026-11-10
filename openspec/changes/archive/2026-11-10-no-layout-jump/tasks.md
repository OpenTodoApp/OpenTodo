# Tasks

## 1. The selection bar

- [x] 1.1 `SelectionBar` floats in a fixed dock over the bottom of the app frame, above the tab bar on a phone; the add button steps aside and the content keeps room under its last row while it shows (`index.css`); a toast in the corner rises above it from 768 px. Verified by `web/src/app/noLayoutJump.test.tsx` (a row's position before and after ticking at 390 and 1280 px, the add button aside and back) and the existing bulk tests.
- [x] 1.2 `revealRow` keeps the cursor row above the bar. Verified by `web/src/app/bulk/bulk.test.tsx` and the layout check's selection-bar overlays.

## 2. Late notices

- [x] 2.1 The start-view and refused-change notices are action toasts; the update and refused-update prompts float as toasts. Verified by `web/src/app/appCode.test.tsx` and `make ui-lint`.
- [x] 2.2 The routines card sits under the Inbox's tasks; `docs/routines.md`. Verified by `web/src/app/routines/` tests and `make docs-check`.

## 3. The rituals

- [x] 3.1 `offersQuickAdd` is false for Focus and Close the day. Verified by `web/src/app/quickAddRoutes.test.ts` and `web/src/app/noLayoutJump.test.tsx`.
- [x] 3.2 On a phone Close the day's Reopen stands in the page, with one divider under the shell's bar. Verified in the app at 390 px.

## 4. Words and integration

- [x] 4.1 `docs/bulk-actions.md`; changelog fragment `changelog.d/Fixed/no-layout-jump.md`. Verified by `make docs-check` and `make repo-check`.
- [x] 4.2 `npm test`, `npm run typecheck`, `npm run lint` in `web/`; `make ui-lint`, `make i18n-check`, `make openspec-validate`, `make bundle-budget`. Verified by those commands.
