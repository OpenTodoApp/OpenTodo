# Proposal

## Why

Notes, comments and assistant answers are stored as Markdown and shown as formatted text. A fenced code block renders as a `<pre><code>` box, but there is no way to take the code out except selecting it by hand — painful on a phone and easy to lose in a long block. People paste commands from their notes into a terminal constantly. The code block should offer that copy itself.

## What Changes

- **Copy from every code block.** Every fenced code block shown as formatted text gets a **Copy** button in its top end corner, on every surface that renders notes, comments or answers as text: task notes and their preview, project notes, standalone notes, comments, assistant answers, the public task and note pages. Every reader gets it, including a viewer of a shared project.
- **The block's text, as it is.** The button puts the block's text on the clipboard as plain text: no fence lines, no formatting, the code's own indentation kept, no trailing newline. It reuses `copyText` (`web/src/lib/clipboard.ts`), so it works on a self-hosted server opened over plain http as well as in a secure context. It announces **Copied**, or that it could not copy when the browser refuses the clipboard, in place.
- **A viewer can copy a whole note.** A note the reader may not edit offers a **Copy note** action that copies the note's Markdown, reachable with the keyboard (it sits in the Tab order before the note's text).
- Nothing is stored or synced. No new dependency, route, op field or environment variable. Not **BREAKING**.

Out of scope: a per-block copy button inside the rich-text editor (the editor has its Markdown source mode; a node view is a later change); copying inline code; a language label beside the code; syntax highlighting.

Roadmap: the "Notes area" in `ROADMAP.md`, beside the shipped [`note-markdown-source`](../archive/2026-11-13-note-markdown-source/) row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: a Copy button on every code block shown as formatted text, and a Copy note action on a read-only note.

## Impact

- Web: `web/src/app/MarkdownView.tsx` (the `pre` block and a small copy control), `web/src/app/NotesEditor.tsx` and `web/src/app/notes/NoteEditor.tsx` (a viewer's Copy note and the note's corner), `web/src/app/ProjectNote.tsx` (one reserved corner slot), `web/src/index.css`, one story, the catalogs.
- Docs: a new guide page `docs/copy-code-blocks.md` and one sentence in `docs/formatting.md`.
- Size: under 1 KB gzip added to the first load (the renderer is not lazy; the control is an icon button and a few hundred bytes), reported by `make bundle-budget`.
