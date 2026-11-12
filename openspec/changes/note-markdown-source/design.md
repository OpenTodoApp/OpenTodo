# Design

## Context

A note is a mergeable document (`notes_doc`) with a deterministic Markdown projection (`description`) that reparses into the same document (`rich-text-editing` "Plain-text projection kept in sync"). Plain-text writers already fold back into the document, but by replacing the whole content, which is right for a stale script and wrong for a live editor: it would drop a concurrent edit from another device.

## Goals / Non-Goals

Goals: see and edit the exact Markdown of a note; keep concurrent edits merging; no new stored state.

Non-goals: a second editor engine, live preview, highlighting, a stored preference.

## Decisions

### D1. The source is the projection, edited in a textarea

Entering the mode shows the current projection in a plain `<textarea>` (monospace, the note's width, growing with its content so it stays in the panel's or page's own scroller). No new scroll region. Leaving it shows the rich text again with the caret at the block that held the textarea caret.

Alternatives considered:
- **A code editor library (CodeMirror).** Rejected: a dependency of 100+ KB for highlighting the bar does not ask for.

### D2. Block-level application at each pause

At each pause in typing (the note push cadence's local save) and on leaving the mode, the device parses the source text into blocks with the fold-back parser, aligns them with the document's top-level blocks by a longest-common-subsequence over each block's projection, and applies one transaction that deletes, inserts or replaces only the blocks that differ. Unchanged blocks keep their nodes (mentions, attachment images, table cells), so a block nobody edited never round-trips through Markdown. The transaction is an ordinary document edit: the projection is republished in the same batch and the edit merges with concurrent edits under the document rules.

Alternatives considered:
- **Fold-back on leaving (replace the content).** Rejected: concurrent edits from another device made during the source session would be lost.
- **Character-level diff into the document.** Rejected: mapping text offsets through Markdown syntax into document positions is fragile; blocks are the unit the projection already defines.

### D3. Remote edits while in source

When a remote edit changes the document, the device re-projects it and updates the textarea only in the blocks the user has not changed since the last pause, keeping the caret and selection by block and offset. If a remote edit touches the block being typed in, the user's text wins locally and the merge of the two edits happens in the document at the next pause, as two rich-text edits of the same block would.

### D4. Keys and entry points

`Ctrl+Shift+M` / `⌘+Shift+M` (editor scope, `editor.source`, free in the registry) toggles the mode while a note has focus. The slash menu gains **Markdown** (and in source mode the key or the button leaves it; `/` is plain text there). On a fine pointer a **Markdown** button sits beside the Formatting toggle, revealed with it. Esc in source mode leaves the note as Esc does today.

### D5. Interface budget

No new row of chrome (the button shares the Formatting toggle's corner), no new scroll region, one new shortcut registered without a conflict, no task property added.

## Data model

None. No field, op or route. The mode is component state.

## Size and memory

About 1 KB gzip in a lazy chunk with the editor; no runtime cost while the mode is off.

## Risks / Trade-offs

- A block written in source that the parser reads differently from what the user meant (a stray `- `) becomes that block; this is the same reading as typing it in rich text and is shown on leaving.
- Large notes: block alignment is linear in blocks with a quadratic worst case; capped by the document size limits (a note at the limit aligns in under 50 ms on the phone profile, checked by a unit benchmark).
