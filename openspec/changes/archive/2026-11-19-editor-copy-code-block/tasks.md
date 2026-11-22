# Tasks

## 1. One copy control

- [x] 1.1 Move the rendered block's Copy control out of `MarkdownView.tsx` into an exported `CodeBlock` (its bar, its `CopyCode` button, the `ok`/`failed` state, `codeText`) that both surfaces mount; `MarkdownView` renders it for a `pre` block. Verified by `web/src/app/markdownCopy.test.tsx` passing unchanged.
- [x] 1.2 Keep `data-code-block` and `data-code-copy` on the shared control, so the existing tests and the deployment check (`scripts/podman-testenv.sh check`) find the button as before. Verified by `npm test` in `web/`.

## 2. The editor's node view

- [x] 2.1 Add `web/src/app/editorCode.tsx`: a `NodeView` for `code_block` whose `dom` is the `pre > code` shape with `contentEditable = false`, rendering the shared `CodeBlock` over `node.textContent`; `stopEvent` claims mousedown on the bar and lets typing through; `update` re-renders on text or `lang` change. Verified by a new `web/src/app/editorCode.test.tsx`.
- [x] 2.2 Register it in `NotesEditor`'s `nodeViews` beside `imageViews` and `refViews`, and give the editor's block the renderer's `md-code` styles in `web/src/index.css`. Verified by the storybook story and by opening a note with a code block in `make debug-seeded`.

## 3. Tests

- [x] 3.1 Node-view test: the button exists on a code block in the editor, activating it puts the block's text (no fences, no trailing newline, indentation kept) on the clipboard and announces "Copied"; a refused clipboard announces "Could not copy". Mirrors `markdownCopy.test.tsx`.
- [x] 3.2 Caret test: with the caret in a paragraph, activating the button leaves the selection unchanged and does not write to the note.
- [x] 3.3 Read-only test: a viewer's note shows the button and copies. Verified by `npm test` in `web/`.
- [x] 3.4 Storybook: a `RenderedCodeBlock` twin, `EditorCodeBlock`, in `web/src/app/editor.stories.tsx`, checked by `make ui-check`.

## 4. Finish

- [x] 4.1 `cd web && npm test && npm run build`, then `make bundle-budget` (the first-load budget holds).
- [x] 4.2 `make openspec-validate` passes; add `changelog.d/Added/editor-copy-code-block.md`.
- [x] 4.3 `make check`.
- [x] 4.4 Rebuild the debug image (`make debug-clean && make debug-seeded`) and confirm the button on the reported task's note.
