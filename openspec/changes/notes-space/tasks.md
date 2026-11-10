# Tasks

## 1. The space

- [ ] 1.1 `web/src/lib/sidebarSpace.ts`: the device-stored space, `spaceOfView` and the store with `resettable()`, with unit tests for the route map, storage refused and the neutral screens; verify with `npm test -- sidebarSpace` in web/
- [ ] 1.2 Move the start-view navigation from `Shell.tsx` into `web/src/app/startView.ts` and use it from the Shell and the switch; verify with `npm test` in web/ (shell start-view tests unchanged)
- [ ] 1.3 `SpaceSwitch` (SegmentedControl; two icons in the rail) under the workspace control in `Sidebar.tsx`, the Notes space's lazy `notes/NotesSidebar.tsx` (All notes, the Graph slot, Pinned, Recent), the space following the route; interaction tests in happy-dom for "Switch to Notes", "Back to Tasks", "A link to a task" and "Settings keeps the space"; verify with `npm test` in web/
- [ ] 1.4 Notes leaves More and `PROMOTABLE`; a stored `notes` promotion is ignored and kept (`setPromoted` test); pinned notes leave the Tasks space's Favourites group; update the sidebar and appearance stories; verify with `npm test -- appearance Sidebar FavouritesGroup` in web/

## 2. Tokens

- [ ] 2.1 `web/src/lib/noteQuery.ts`: token parsing, chips by id, the matcher (`in:` with sub-projects, `@`/`label:`, `kind:`, `linked:`, `orphan`, `pinned`, `changed:`), suggestions and the conversion of stored filters, with unit tests for every scenario of "Search tokens" and a count check over 2,500 entries; verify with `npm test -- noteQuery` in web/
- [ ] 2.2 `NoteSearchField.tsx`: chips in the field with remove buttons, Backspace, the suggestions through `useCombobox` and `ComboboxList`, Tab key completion, Enter unchanged; interaction tests for "Labels like the task filter", "Remove a chip" and "Enter still opens"; verify with `npm test` in web/

## 3. The page

- [ ] 3.1 `NotesPage.tsx` on the tokens (Pinned and Recent only without words and chips; new notes take the chips' project and labels), the header as a small `NotesHeader` with the documented view-switch slot, `NoteFilters.tsx` removed; update `notesPage.test.tsx`; verify with `npm test` in web/
- [ ] 3.2 `NoteRow.tsx` as one line on the row grid (kind, title and snippet, place, labels, time), phone at 48 px; update the Notes stories (light and dark) and only the baselines that really change (`make ui-check`); verify with `npm test` and `npm run build` in web/

## 4. Keys, docs and checks

- [ ] 4.1 `go.notes` describes the Notes sidebar; keyboard guide regenerated (`make docs`); verify with `npm test -- shortcuts` in web/
- [ ] 4.2 Strings in every catalog (`node ../scripts/i18n/extract.mjs --write`, `make i18n-check`); `docs/notes.md`, `docs/notes-home.md`, the sidebar docs; `changelog.d/Changed/notes-space.md`; the ROADMAP row; verify with `make docs` and `make docs-check`
- [ ] 4.3 Bundle: entry and first load within `web/bundle-budget.json` or raised by the minimum with the reason (`make bundle-budget`); verify with `make bundle-budget`
- [ ] 4.4 Run the checks: `npm test`, typecheck, lint, `make ui-lint`, `make i18n-check`, `make openspec-validate`, `make docs-check`, `node --test scripts/repo-checks.test.mjs`; screenshots of the switch, the Notes sidebar, the list, search with chips and the phone drawer in light and dark at 1280 and 390 px
