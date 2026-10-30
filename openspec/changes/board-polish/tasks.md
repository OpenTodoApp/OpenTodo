# Tasks: board-polish

## 1. Data model

- [ ] 1.1 Add `card_notes` (`kBool`, default `false`) to `project_prefs` and to `view` in `internal/sync/ops.go` `Schema` with a comment naming this change; verify `go test ./internal/sync/...` (schema and kind tests) passes
- [ ] 1.2 Add `card_notes?: boolean` to the `ProjectPrefs` and `View` types in `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; verify the schema parity test (Go `Schema` vs TS defaults) passes with `npm test`
- [ ] 1.3 Accept and return `card_notes` as a boolean in the views REST handlers (`POST`/`PATCH /api/v1/views`, `400 invalid_input` for a non-boolean) and add the row to the views table in `docs/api.md`; verify with a new case in the views handler test and `go test ./internal/httpapi/...`

## 2. Fold a column

- [ ] 2.1 Read the fold state of a project board column from `loadCollapsedSections` / `setSectionCollapsed` and of a view or filter-board column from `collapsedGroups.ts`; verify in `boardView.test.tsx` that folding on the board collapses the section in the list layout and the other way round, and that no op is queued
- [ ] 2.2 Render a folded column as the strip of design D2 (icon or dot, count, vertical name, one button with `aria-expanded="false"` and the accessible name "<name>, <n> open tasks, folded"); add "Fold column" to the column menu; never fold "Add a section"; verify with `boardView.test.tsx` cases for the strip, the name and the menu item
- [ ] 2.3 Keep a folded strip a drop target (whole-length dashed edge while dragged over, move last into the section or group, view drop rules respected, viewers refused) in `useBoardDrop.ts`; verify with a `boardView.test.tsx` drop test, a viewer test and a view `on_drop` test
- [ ] 2.4 Add the `board.fold` registry row (`z`, scope `board`) in `web/src/lib/shortcuts.ts`, make `h`/`l` skip folded columns, and make Shift+Left/Right into a folded column move the task, select the neighbour card and announce "Moved to <name>"; verify the registry conflict test passes and a keyboard test in `boardView.test.tsx`
- [ ] 2.5 Phone layout of design D9 (48 px strip with its own snap point, one pager dot per unfolded column, page bar names only unfolded columns, tap unfolds and scrolls into view); verify in `boardPhone.test.tsx` at 390 px and in the layout run at 360 px in German and French (`make e2e` layout step)

## 3. Notes preview

- [ ] 3.1 Write `web/src/lib/notesPreview.ts` (design D6) with a table-driven `notesPreview.test.ts` covering headings, emphasis, code, quotes, links, images, attachments, embeds, tables, lists, checklists, mentions, whitespace and the 280-character cap; verify `npm test`
- [ ] 3.2 Render the preview on cards between the title and the property row (two-line clamp, metadata size, muted tone, part of the accessible name, nothing when empty or still ciphertext); verify with `boardView.test.tsx` cases including an encrypted-account fixture whose notes are ciphertext
- [ ] 3.3 Add the checkable "Show notes on cards" item to the project board's page menu writing `project_prefs.card_notes` through `mutate()`; verify with a test that the op is queued offline and that another member's preference is untouched
- [ ] 3.4 Add the "Notes on cards" switch to `DisplayPanel` under "Show on rows", shown only for the Board layout, writing `view.card_notes`; verify with `listDisplayPanel.test.tsx` / the display panel tests

## 4. Workbench, i18n and docs

- [ ] 4.1 Add stories to `board.stories.tsx` and `boardOfFilters.stories.tsx`: a folded column at rest and while dragged over, and cards with previews of one, two and more lines and none; verify `make ui-check` (accessibility and visual-regression gates) passes in light and dark at 375 and 1280 px
- [ ] 4.2 Add the new strings ("Fold column", "Show notes on cards", "Notes on cards", "<name>, <n> open tasks, folded", "Moved to <name>") to the six catalogs (en, de, fr, es, it, pt); verify `node scripts/i18n-check.mjs`
- [ ] 4.3 Document folding and the notes preview in the boards section of the user docs (docs/ page that covers `sections-and-boards`) and let `make docs` regenerate docs/keyboard.md with `z`; verify `make docs` leaves no diff and the docs check passes
- [ ] 4.4 Add a CHANGELOG.md entry under Unreleased at archive time; verify `make check` passes before marking the change done
