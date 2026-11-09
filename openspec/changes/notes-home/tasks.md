# Tasks

## 1. Pins

- [ ] 1.1 Add the `note` kind to `web/src/lib/favourites.ts` (resolution to live standalone notes, Trash hides, restore shows) with a test that a 1.0-shaped write keeps `note:` entries; verify with `npm test -- favourites` in web/
- [ ] 1.2 Pin and Unpin in the note row menu, the note's menu and the palette while a note is open; interaction test in happy-dom with `waitFor`; verify with `npm test` in web/
- [ ] 1.3 Pinned notes in the sidebar Favourites group (note icon, title, no count, reorder and unpin from the menu) with the sidebar story baseline updated (`make ui-check`); verify with `npm test` in web/
- [ ] 1.4 `set_favourite` accepts `kind: "note"` (`internal/agenttools/write_structure.go`), refusing ids that are not readable standalone notes with `not_found`; verify with `go test ./internal/agenttools ./internal/mcp`

## 2. The home list

- [ ] 2.1 Pinned and Recent groups in `web/src/lib/noteList.ts` for the default state only (no headings without pins, no duplicates, pagination of Recent unchanged), with unit tests; verify with `npm test -- noteList` in web/
- [ ] 2.2 Render the groups on `NotesPage.tsx` with `j`/`k` over group headers like task lists; update `notesPage.test.tsx` and the Notes stories and baselines (`make ui-check`); verify with `npm test` and `npm run build` in web/

## 3. Write from the search field

- [ ] 3.1 The New note row, the cursor rule (first match, else New note; Up reaches it) and creation into the Project filter's project with the caret in the body and one Undo; tests for "write right away", "search still comes first" and offline creation; verify with `npm test` in web/
- [ ] 3.2 Phone layout: the 48 px row, pin from the long-press menu, checked in the 375 px baseline (`make ui-check`) and the layout check (`make layout-check`)

## 4. Unlinked

- [ ] 4.1 The Unlinked Source value from the `note-links` index (standalone notes only, outgoing links ignored, built in slices on choice), absent without links; tests for the "Unlinked" scenarios, encrypted and offline; verify with `npm test` in web/

## 5. Docs and integration

- [ ] 5.1 Update `docs/notes.md` (Pinned, writing from search, Unlinked) and the Notes screenshots (`make docs-screenshots`), add `changelog.d/Added/notes-home.md`, strings in every catalogue (`make i18n-check`); verify with `make docs` and `make docs-check`
- [ ] 5.2 Confirm the `notes-page` nightly metric is unchanged on a local run (`make perf`) and run `make check`; verify both pass
