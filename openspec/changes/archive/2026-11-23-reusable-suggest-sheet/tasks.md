## 1. The add sheet

- [x] 1.1 `QuickAddSheet` passes the reusable list it was opened in as `reuseProjectId`. Verify: `npx vitest run src/app/reusableSuggest.test.tsx` in `web/` (the sheet test fails without it); the list sits in the sheet's flow and Esc closes only the list (fails without the stack change)
- [x] 1.2 `docs/reusable-lists.md`; `changelog.d/Added/reusable-suggest-sheet.md`. Verify: `make docs` and `make docs-check`
