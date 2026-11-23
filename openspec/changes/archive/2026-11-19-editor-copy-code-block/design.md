# Design

## Context

`copy-code-block` gave every fenced code block shown as formatted text a Copy button, in one place: `MarkdownView.tsx`. Its design D1 rejected a `code_block` node view for the editor and named it "a later change if people ask for it"; this is that change.

The editor (`NotesEditor.tsx`, ProseMirror) already has two React node views for the same reason — an atom whose DOM has behaviour the schema cannot express: `editorImage.tsx` (`image`) and `editorRef.tsx` (`ref`). Both are classes implementing `NodeView`, mounting a React root, wired once in the editor's `nodeViews` option. The task page edits its notes in this editor, which is why its code blocks have no button today.

The copy semantics to keep are in `MarkdownView.tsx`: `copyText` from `lib/clipboard` (the Clipboard API, then `execCommand` on plain http), the block's text without its fences and its trailing newline, and a two-second `ok` / `failed` state that replaces the icon and is announced.

## Goals / Non-Goals

Goals: the same button, the same text, the same announcements in the editor as in rendered Markdown; one implementation, so the two cannot drift; the editor's caret and typing unchanged.

Non-goals: a visible change to any surface that already has the button; language labels; syntax highlighting; copying inline code; a button inside Markdown source mode (it shows the raw text, which is already selectable).

## Decisions

### D1. A node view, and the copy control shared with the renderer

The editor draws a `code_block` through a node view (`editorCode.tsx`) that renders the same block the renderer does. The button, its `ok`/`failed` state, the label and the text it copies move out of `MarkdownView`'s `CodeCopy` into one exported component (`CodeBlock` with its `CopyCode` control), which both the renderer and the node view mount. The alternative — a second `CodeCopy` in the node view — was exactly what the original design weighed and rejected: two implementations of one action drift, and the tests would have to pin both.

The node view is registered in `NotesEditor`'s `nodeViews` beside `imageViews` and `refViews`, so the editor keeps one list of its node views.

### D2. The text copied is the node's text

The node view copies the block node's text (`node.textContent`), which is the text the document holds: the same text the renderer copies from the parser's `pre` block. The shared control strips trailing newlines from whatever it is given (`codeText`), so both paths agree. Indentation is part of the node's text and is kept.

### D3. The button never takes the caret

The button's DOM is inside the node view's `dom`, which is `contentEditable = false` like the image and link views; the view's `stopEvent` claims mousedown on the button so ProseMirror does not place the caret in the block when it is clicked. After copying, focus returns to where it was: the editor is not focused by the action. This is what makes the button usable mid-sentence, and it is the one behaviour the tests must pin (copy works; the selection is unchanged).

### D4. A read-only note draws the same block

A viewer's note is the same editor with `editable` false. The node view reads `view.editable` only to decide whether the block is selectable as a node; the button is offered either way, as it is on rendered Markdown, so a viewer can copy a command too. Nothing is written.

## Interface budget (docs/interface-guide.md)

No new row of chrome above a list's first item (the button lives inside the code block, as in the renderer), no new task property, no new sidebar destination, no new scroll region (the bar is one line; the block keeps its own scroller), no new shortcut. The bar reuses the renderer's `md-code` styles so the block looks the same in both places and adds no new chrome.

## Data model

None. Nothing is stored, synced or sent: the node, its attributes and the document encoding are unchanged, so there is no offline or convergence behaviour to state beyond "as today".

## Size and memory

No dependency. The node view lives in the editor's lazy chunk (`NotesEditor` is `React.lazy`), so the first load is unchanged; the shared control moves from the renderer's chunk into the one both import, which the bundler already shares. Expected under 1 KB gzip on the chunk that first opens a note, reported by `make bundle-budget`. The container image and runtime memory are unchanged.

## Risks / Trade-offs

- A node view replaces the default `<pre><code>` DOM, so text selection across a block boundary and the parser round-trip must keep working: the node view's `dom` keeps the `pre > code` shape the schema's `toDOM` produces, and the model/markdown round-trip is untouched because it reads the node, not the DOM.
- A click on the bar is a click in the editor; `stopEvent` must claim it or the caret jumps. Covered by a test.
- A future rendering of the block (line numbers, highlighting) now has two places to change; sharing the control keeps that to one for the button.
