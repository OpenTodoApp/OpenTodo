# Tasks

## 1. Outline

- [ ] 1.1 Heading extraction from the editor state (top-level, levels 1–3, 3+ rule) and the current-heading rule, with unit tests; verify with `npm test -- noteOutline` in web/
- [ ] 1.2 `NoteOutline.tsx`: sticky column from a 52 rem note column, Outline button and `Menu` otherwise and in the panel and project notes, jumping with caret or focus, reduced motion; interaction tests in happy-dom for "Jump to a section", "Docked panel", "Short note" and "Read-only"; verify with `npm test` in web/
- [ ] 1.3 `editor.outline` (`Ctrl+Shift+O`, `⌘+Shift+O`) and the outline's keys; tests for "Keyboard only" and "Esc returns"; verify with `npm test -- shortcuts` in web/ (no conflict)
- [ ] 1.4 Layout check: no new scroll region (`budget.test.tsx`, layout check); stories in light and dark at 1440 and 390 px; verify with `make layout-check` and `make ui-check`

## 2. Docs and checks

- [ ] 2.1 Strings in every catalog (`node ../scripts/i18n/extract.mjs --write`, `make i18n-check`); `docs/notes-and-subtasks.md`, `docs/notes.md`; `changelog.d/Added/note-outline.md`; the ROADMAP row; keyboard guide regenerated; verify with `make docs` and `make docs-check`
- [ ] 2.2 Run `npm test`, `npm run build` in web/, `make bundle-budget`, `make openspec-validate` and `make check`
