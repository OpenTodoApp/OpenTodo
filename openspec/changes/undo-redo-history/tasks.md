# Tasks

## 1. History model (done)

- [x] 1.1 The undo and redo stacks as views over the existing `assistantUndo` store (undo = not `undone_at`, newest first; redo = `undone_at`). Verified: `web/src/lib/undoRedo.test.ts`.
- [x] 1.2 Capture the redo payload (values + field clocks) in `undoBatch`; `redoBatch` replays it. Shared `reverse()`. Verified: redo tests.
- [x] 1.3 `applyBatch` clears the redo stack on a new recorded action (D3). Verified: D3 test.
- [x] 1.4 Clock bookkeeping (D4) both directions: a reversal points every other batch (undo-stack `clocks` and redo-stack `redo.clocks`) at a field's new clock; a hand change in between is skipped and never refreshed. Verified: "undo our later change then the earlier one" and "undo two then redo two" tests.

## 2. Surfaces (remaining)

- [ ] 2.1 A history controller exposing whether undo/redo is available and the next step's name, over the store (live).
- [ ] 2.2 Shortcuts through the existing registry: Ctrl/Cmd-Z undo, Ctrl/Cmd-Shift-Z and Ctrl-Y redo, inert in a text field/textarea/contenteditable/editor that owns its undo, and inert when the direction has no history.
- [ ] 2.3 Undo and Redo as command-palette commands and overflow-menu items, disabled when empty, labelled with the next step's name; the undo toast shares the stack.
- [ ] 2.4 A step describer (verb + title, or verb + count) for the labels and feedback; descriptive feedback after undo/redo including skipped items, no new countdown.

## 3. Lifecycle, docs, release (remaining)

- [ ] 3.1 Clear both stacks on sign-out; keep 20 across reloads.
- [ ] 3.2 Docs: a short "Undo and redo" section (shortcuts, controls, documented limits). Verify: `make docs-check`.
- [ ] 3.3 Changelog fragment. Verify: `make repo-check`.
