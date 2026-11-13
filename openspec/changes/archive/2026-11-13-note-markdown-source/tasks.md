# Tasks

## 1. Block application

- [x] 1.1 Block-diff helper: parse source with the fold-back parser, align top-level blocks by their projection, one transaction replacing only changed blocks, with unit tests for unchanged mentions, images and tables, inserted and deleted blocks, and a benchmark at the document size limit (under 50 ms in the phone profile); verify with `npm test -- markdownSource` in web/
- [x] 1.2 Remote updates into the textarea per unchanged block, keeping caret and selection; tests for "Remote edit while typing" and a two-document merge test for "Concurrent edit kept"; verify with `npm test` in web/

## 2. The mode

- [x] 2.1 Lazy `MarkdownSource.tsx` in the note editor for task, project and standalone notes; read-only for viewers; caret mapping back to rich text; interaction tests in happy-dom for "Open the source", "Fix a list", "Viewer" and "Not remembered"; verify with `npm test` in web/
- [x] 2.2 Entry points: `editor.source` (`Ctrl+Shift+M`, `⌘+Shift+M`) in `web/src/lib/shortcuts.ts`, the slash menu entry, the Markdown button beside the Formatting toggle; verify with `npm test -- shortcuts` in web/ (no conflict)
- [x] 2.3 Stories in light and dark; verify with `make ui-check`

## 3. Docs and checks

- [x] 3.1 Strings in every catalog (`node ../scripts/i18n/extract.mjs --write`, `make i18n-check`); `docs/notes-and-subtasks.md`; `changelog.d/Added/note-markdown-source.md`; the ROADMAP row; keyboard guide regenerated; verify with `make docs` and `make docs-check`
- [x] 3.2 Run `npm test`, `npm run build` in web/, `make bundle-budget`, `make openspec-validate` and `make check`
