# Tasks

## 1. The wrapping line

- [x] 1.1 `QuickAdd` renders a one-row `textarea` in a grid cell with `QuickAddTint`, which wraps, caps at five lines and follows the field's `scrollTop`; Enter calls `requestSubmit()`; line breaks become spaces (`quickAdd.test.tsx` "is a wrapping field where Enter adds")
- [x] 1.2 The `+`, microphone and hint in first-line boxes (`.quick-add-lead`); the microphone and voice notice moved to `quickadd/VoiceParts.tsx` (`npm run lint`: the function size limit)
- [x] 1.3 Ref types from `HTMLInputElement` to `HTMLTextAreaElement` (TaskListView, list bindings and shortcuts, dictation, paste offer, share screen, stories) (`npx tsc -b`)

## 2. Notes

- [x] 2.1 `quickadd/NotesLine.tsx`: the notes field and `useNotesField`; Shift+Enter opens it, Enter adds, Backspace on empty closes, sized up to six lines (`quickAdd.test.tsx` notes cases)
- [x] 2.2 `description` on `QuickAddInput`, passed with the task (`quickAdd.test.tsx`, `quickAddSheet.test.tsx` checks the stored task)
- [x] 2.3 The sheet's Notes tool in `SheetBar` (`quickAddSheet.test.tsx` "the Notes tool opens a notes field")
- [x] 2.4 The palette keeps Shift+Enter for add and open; `notes={false}` on the share screen (`quickAdd.test.tsx` "the palette keeps Shift+Enter")
- [x] 2.5 `useListBindings`: an `o` insertion ends only when focus leaves the quick add's form
- [x] 2.6 The `quickadd.notes` entry in `web/src/lib/shortcuts.ts`, translated in every catalog (`npx vitest run src/lib/shortcuts.test.ts`, `make i18n-check`)

## 3. Tests, docs and checks

- [x] 3.1 Selectors of tests that typed into the quick add use `textarea`; `scripts/screens.mjs` too (`npm test`)
- [x] 3.2 Stories `WithNotes` and `PhoneSheetWithNotes`; visual baselines regenerated for the quick add stories (`make ui-baselines`)
- [x] 3.3 `docs/quick-add.md`, `make docs` for the keyboard guide, changelog fragment `changelog.d/Added/quick-add-notes.md`
- [x] 3.4 `npm run build`, `make bundle-budget i18n-check ui-lint docs-check openspec-validate`
