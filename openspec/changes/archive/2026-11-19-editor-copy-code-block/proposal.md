# Proposal

## Why

The `copy-code-block` change put a Copy button on every fenced code block shown as formatted text, and deliberately left the rich-text editor out of scope (its design D1: "a copy button inside the rich-text editor's document" was a non-goal, and a `code_block` node view was the rejected alternative, "a later change if people ask for it").

People are asking for it. The task note is the place a person writes a command they will run, and it is edited, not rendered: opening a task shows its notes in the editor, so its code blocks are bare `<pre><code>` with no button, while the same snippet pasted into a comment has one. The documented workaround — Markdown source mode (`Ctrl+Shift+M`), select the block, copy — works but is three steps for an action every other surface offers in one click. The reported case: a task note with two fenced blocks, no Copy button on either.

## What Changes

- **A code block in the editor gets the same Copy button.** A `code_block` node view draws the block in the editor with the Copy button in its bar above the code, exactly as rendered Markdown does, and copies the same text with the same rules (no fence lines, the code's own indentation, no trailing newline) and the same announcements ("Copied", "Could not copy").
- **One implementation of the copy action.** The button, its state and the text it copies are shared with the rendered block rather than written twice, so the two surfaces cannot drift apart.
- **The editor keeps its caret.** Activating the button does not move the caret into or out of the block, and typing in the block keeps working as it does today.

Out of scope: the Copy note action (a read-only note's whole Markdown) — an editor is writable, and that action is unchanged; language labels and syntax highlighting; copying inline code; a button in any surface that already has one (comments, answers, public pages, rendered notes are unchanged); the Markdown source mode, which already shows the raw text.

Advances the ROADMAP item "Notes that are a pleasure to write".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: the existing requirement "Copying a code block" is extended from "every fenced code block shown as formatted text" to every code block in the editor too.

## Impact

- `web/src/app/editorCode.tsx` (new, the `code_block` node view, lazy chunk only), `web/src/app/MarkdownView.tsx` (the Copy control and the text it copies, exported for reuse), `web/src/app/NotesEditor.tsx` (one line: the node view in `nodeViews`), `web/src/index.css` (the block's bar in the editor).
- No data, op, route, setting or string changes: the strings "Copy code", "Copied" and "Could not copy" already exist in every catalog. No dependency, so no image-size or memory change.
- Tests: a node-view test in the editor (the button copies the block's text; the caret stays), and the existing rendered-Markdown tests keep passing against the shared control.
