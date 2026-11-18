# Design

## Context

Every place that shows Markdown as formatted text goes through one renderer, `web/src/app/MarkdownView.tsx` (`web/src/app/Markdown.tsx` only adds device-only embeds on top): task notes and their preview, project notes, standalone notes, comments, assistant answers, the public task and note pages. Its parser (`web/src/lib/markdown.ts`) already keeps a fenced block's text in a `pre` block, without the fence lines, in `Block.v`. Copying is therefore a renderer concern: one change reaches every surface.

The clipboard is `copyText` (`web/src/lib/clipboard.ts`): the asynchronous Clipboard API where it exists, `execCommand('copy')` on a self-hosted server opened over plain http, a rejection when neither works. The assistant's answer actions (`web/src/app/assistant/MessageActions.tsx`) already follow the pattern this reuses: a state that is `'ok'`, `'failed'` or nothing, reset after two seconds, `check` in place of `copy` when copied.

## Goals / Non-Goals

Goals: one way to copy a block, the same on every surface; it works on plain-http self-hosting; keyboard reachable; it works for viewers, who see a read-only note.

Non-goals: a copy button inside the rich-text editor's document (the editor shows its raw text through Markdown source mode); language labels; syntax highlighting; copying inline code.

## Decisions

### D1. The renderer, not the editor

The button belongs to the rendered `pre` block in `MarkdownView`, not to a ProseMirror node view. Every surface that shows formatted text goes through it, so one change covers notes, comments, answers and public pages, and the editor keeps its own escape hatch: Markdown source mode (`Ctrl+Shift+M`), where the whole text is selectable as it is.

Alternatives considered:
- **A node view for `code_block` in the editor.** Rejected for this change: it needs a ProseMirror node view with its own click handling inside the editor, a second implementation of the same action, and the editor already offers the raw text. It is a later change if people ask for it.

### D2. The copied text is the block's text

The button copies the block's text as the parser kept it: no fence lines, the code's own indentation, and no trailing newline, so a pasted command runs at once instead of waiting for Enter. Indentation is kept because it is part of the code: a Python snippet pasted without it does not run.

Alternatives considered:
- **Copy the rendered `textContent` of the `pre`.** Rejected: it is the same text today, but it would silently change with any future rendering of the block (line numbers, highlighting), and it is not the stored text.
- **Keep the trailing newline.** Rejected: a command pasted with a newline runs immediately, before the user has looked at it; a block pasted into a file rarely cares either way.

### D3. A bar above the code, not a button over it

The Copy button sits in a one-line bar at the top end of the block, above the code, so it never covers the first line of a command. The code keeps its own horizontal scroller. Where the block sits under a note's own corner (the project note's Outline and Markdown buttons, a note's own corner), the note reserves one more slot for the first block's bar, through the existing `--notes-corner` padding, so the two never overlap.

Alternatives considered:
- **A floating button over the code.** Rejected: on a phone the first line is the one that matters most and the button would cover it; a bar is one line of chrome inside the block, not a row above the note.

### D4. A viewer's Copy note

A note the reader may not edit shows its body read-only, so the block buttons cover it, but a note with no code block would have no copy action at all for a viewer. A read-only note therefore offers a **Copy note** action that copies the note's Markdown. It is visually hidden (the corner has no room for another visible button) but present in the Tab order before the note's text, with its name in the tooltip, and it is announced when used: "every action reachable without a mouse" holds.

Alternatives considered:
- **A visible button in the corner.** Rejected: it takes a slot from the note's own controls and adds chrome to every note for an action used rarely; the hidden control keeps the interface budget.

### D5. Interface budget

No new row of chrome above any list's first item (the button lives inside the code block; the corner slot is the existing mechanism), no new scroll region (the bar is one line; the code keeps its own scroller), no new shortcut (none), no task property. Data model: none — nothing is stored, synced or sent anywhere.

## Size and memory

Under 1 KB gzip on the first load (an icon button, a short state and a bar's CSS), reported by `make bundle-budget`. No new dependency, so the container image and the runtime memory are unchanged.

## Risks / Trade-offs

- A code block inside a table cell or a quote nests the bar one level deeper; it still sits at the block's top end and reads the same.
- A browser that refuses both clipboard paths leaves the text on screen, as before; the button says so instead of failing silently.
