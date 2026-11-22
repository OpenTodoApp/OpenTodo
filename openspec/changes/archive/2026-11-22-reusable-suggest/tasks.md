## 1. Ticked items suggested while typing

- [x] 1.1 `web/src/lib/tickedItems.ts` (the list's ticked items, matching), `web/src/app/quickadd/TickedSuggest.tsx` (the listbox), joined into `useTokenSuggest`; the list's and a section's quick add pass the reusable list. Verify: `npx vitest run src/app/reusableSuggest.test.tsx src/app/quickAdd.reusable.test.tsx` in `web/`
- [x] 1.2 `docs/reusable-lists.md`; `changelog.d/Added/reusable-suggest.md`. Verify: `make docs` and `make docs-check`
