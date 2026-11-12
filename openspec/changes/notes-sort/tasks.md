# Tasks

## 1. Order

- [ ] 1.1 `web/src/lib/noteSort.ts`: the three comparators with directions and fall-backs (collator with numeric ordering, untitled last, created time per kind), the device-stored order with storage refused; unit tests for "By title", "Reverse", "Created" and storage refused; verify with `npm test -- noteSort` in web/
- [ ] 1.2 Notes list applies the order to Recent without words, keeps Pinned and search ranking, names the heading; update `notesPage.test.tsx` for "Pinned keeps its order", "Search ranks" and "Chips keep the sort"; verify with `npm test` in web/

## 2. Header menu

- [ ] 2.1 The header's **⋯** menu with the Sort radio group and direction arrow (Menu items from `web/src/ui`), merged with the graph menu items in Graph mode; Graph ignores the order; interaction test in happy-dom for picking and reversing by keyboard; update the Notes stories in light and dark (`make ui-check`); verify with `npm test` and `npm run build` in web/

## 3. Docs and checks

- [ ] 3.1 `docs/notes.md` (The list); strings in every catalog (`node ../scripts/i18n/extract.mjs --write`, `make i18n-check`); `changelog.d/Added/notes-sort.md`; the ROADMAP row; verify with `make docs` and `make docs-check`
- [ ] 3.2 Run `make openspec-validate`, `make bundle-budget` and `make check`; screenshots of the menu in light and dark at 1280 and 390 px
