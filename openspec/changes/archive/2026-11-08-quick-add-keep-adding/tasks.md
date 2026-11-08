# Tasks

## 1. The sheet

- [x] 1.1 `web/src/app/QuickAddSheet.tsx`: no `onClose()` after `onAdd` or `onAddMany`; a polite, visually hidden status reads "Added" after each add (verified by `quickAddSheet.test.tsx`)

## 2. Tests

- [x] 2.1 `web/src/app/quickAddSheet.test.tsx`: two tasks added in a row without reopening, the field empty and focused after each, the status announced, Escape closes; the older cases no longer expect the sheet to close (`npx vitest run src/app/quickAddSheet.test.tsx`)

## 3. Docs and checks

- [x] 3.1 `docs/quick-add.md`: the phone paragraph says the sheet stays open; changelog fragment `changelog.d/Changed/quick-add-keep-adding.md`
- [x] 3.2 `npm run build`, `make bundle-budget i18n-check ui-lint docs-check openspec-validate`
