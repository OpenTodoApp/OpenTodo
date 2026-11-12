# Tasks

## 1. Selection

- [ ] 1.1 Generalise the task lists' selection hook over a row id and a `tickable` predicate, task lists unchanged; verify with `npm test` in web/ (existing bulk-actions tests unchanged)
- [ ] 1.2 Notes page: checkbox slot in place of the kind icon, the grip on touch, the selection bar, Select notes in the header's overflow menu, cleared on leaving and in Graph mode; interaction tests in happy-dom for "Tick a range", "Select all skips read-only notes" and "Leave the page"; verify with `npm test` in web/

## 2. Actions

- [ ] 2.1 `web/src/lib/notes.ts` batch writers through `mutateMany`: move (with copy-and-tombstone across scopes), labels (all-or-add, read before write), pin/unpin in favourites, turn into tasks, trash; unit tests with fake-indexeddb for every scenario of "Actions on ticked notes", offline and convergence included; verify with `npm test -- notes` in web/
- [ ] 2.2 `NoteBulkActions.tsx` (lazy with the Notes chunk): the menu with keys, the scope-change review, the confirmation above twenty; shortcuts `m`, `p`, `Shift+L`, `.`, Delete in the Notes page scope; interaction tests for "Move into a shared project is reviewed" and "Label several"; registry test for no conflict; verify with `npm test -- shortcuts NotesPage` in web/
- [ ] 2.3 Undo: toasts, `Ctrl+Z`, skipped fields named; tests for every scenario of "Undo a note bulk action"; verify with `npm test` and `npm run build` in web/

## 3. Docs and checks

- [ ] 3.1 `docs/notes.md` ("Several notes at once"), keyboard guide regenerated (`make docs`); Notes stories with a selection in light and dark (`make ui-check`); strings in every catalog (`make i18n-check`); `changelog.d/Added/notes-bulk-actions.md`; the ROADMAP row; verify with `make docs` and `make docs-check`
- [ ] 3.2 Run `make openspec-validate`, `make bundle-budget`, `make ui-lint` and `make check`; screenshots of the selection bar and the menu in light and dark at 1280 and 390 px
