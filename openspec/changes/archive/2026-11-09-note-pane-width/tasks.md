# Tasks

## 1. The note pane

- [x] 1.1 `PanelResizeHandle` and `setPanelWidth` take a width store (the task panel's by default, `NOTE_PANEL_WIDTH` for the note); the existing task panel tests still pass; verify with `npm test -- sidePanel` in web/
- [x] 1.2 `NotePanel` puts the handle on the pane's left edge (`PanelFrame` `edge`), sets `data-note-split` with the kept width before paint, and `:root[data-note-split]` sizes the slot; interaction test (happy-dom, `waitFor`) for drag, click, ← / → / Home, its own key and reopening at the kept width in `web/src/app/notes/notePaneWidth.test.tsx`; verify with `npm test` in web/
- [x] 1.3 The writing column (at most 40 rem, centred, padded) in the docked note only, the phone page unchanged; checked in the real app at 1280 and 1600 px in light and dark, and in the Notes baselines (`make ui-check`)
- [x] 1.4 The handle's name in every catalogue; verify with `make i18n-check`

## 2. Docs and checks

- [x] 2.1 One sentence in `docs/notes.md`, `changelog.d/Changed/note-pane-width.md`, the change in ROADMAP.md's Notes area; verify with `make docs` and `make docs-check`
- [x] 2.2 The first load stays within `web/bundle-budget.json` without raising it; verify with `npm run build` in web/ and `make bundle-budget`
- [x] 2.3 `make openspec-validate` passes
