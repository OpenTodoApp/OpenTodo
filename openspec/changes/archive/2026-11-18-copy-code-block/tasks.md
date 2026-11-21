# Tasks

## 1. The renderer

- [x] 1.1 The `pre` block of `web/src/app/MarkdownView.tsx` renders a Copy control at the top end corner; it copies the block's text without the fence lines and without trailing newlines, keeping indentation, through `copyText`, and announces Copied or Could not copy in place; verify with `npx vitest run src/app/markdownCopy.test.tsx` in web/ (4 passing)
- [x] 1.2 The styles (`.md-code`, its bar, the corner exception) in `web/src/index.css`; verify with `npm run build` in web/ and `make ui-check`

## 2. The note surfaces

- [x] 2.1 A project note whose rendered body shows a code block reserves one corner slot for the block's Copy button (`web/src/app/ProjectNote.tsx`); verify with `npm run typecheck` in web/
- [x] 2.2 A read-only note offers a hidden, Tab-reachable **Copy note** action (`web/src/app/NotesEditor.tsx`, `web/src/app/notes/NoteEditor.tsx`), and a rendered fallback sits in a `.notes-frame`; verify with `npx vitest run src/app/editor/markdownSource.test.tsx src/app/notes/noteAttachments.test.tsx src/app/notesCadence.test.tsx` in web/

## 3. Story, strings and docs

- [x] 3.1 A story of a rendered code block in `web/src/app/editor.stories.tsx`; verify with `npm run build-storybook` in web/
- [x] 3.2 `Copy code` and `Copy note` in every catalog (`node ../scripts/i18n/extract.mjs --write`, `make i18n-check`)
- [x] 3.3 `docs/copy-code-blocks.md`, one sentence in `docs/formatting.md`, `changelog.d/Added/copy-code-block.md`; verify with `make docs` and `make docs-check`

## 4. Every gate

- [x] 4.1 `npm run typecheck`, `npm test`, `npm run lint`, `npm run build` in web/; `make bundle-budget`, `make ui-check`, `make i18n-check`, `make openspec-validate`, `make docs-check`, `make repo-check` and `make check` at the root
