# Tasks

## 1. History model

- [ ] 1.1 Define the undo and redo stacks as views over the existing `assistantUndo` store (undo = not `undone_at`, newest first; redo = `undone_at`, in undo order), with a controller that exposes the top of each and whether each is available. Verify: unit tests over a seeded store.
- [ ] 1.2 Capture a redo payload (current values + field clocks of the fields the undo changes) in `undoBatch` before applying the inverse; add `redoBatch` as its mirror (one `mutateMany`, `restore`). Verify: unit tests that redo reapplies exactly the undone fields.
- [ ] 1.3 Clear the redo stack when `applyBatch` records a new batch. Verify: a test that a new action after an undo drops the undone entries.
- [ ] 1.4 Clock bookkeeping (D4): refresh an earlier batch's recorded clock for a field undo just rewrote, so a following earlier undo still recognises the field as ours; redo honours the equivalent check and replays only the undone fields. Verify: the scenarios in the spec delta as tests, including the "undo our later change, then the earlier one" case.

## 2. Surfaces

- [ ] 2.1 Shortcuts through the existing registry: Ctrl/Cmd-Z undo, Ctrl/Cmd-Shift-Z and Ctrl-Y redo, inert while focus is in a text field, textarea, contenteditable or a rich editor that owns its undo, and inert when the direction has no history. Verify: interaction tests for focus in and out of a field.
- [ ] 2.2 Undo and Redo as command-palette commands and overflow-menu items (desktop and phone), disabled when empty, labelled with the next step's name; the undo toast calls the same undo. Verify: tests of the labels, disabled state and that the toast shares the stack.
- [ ] 2.3 A step describer (verb + title, or verb + count) reused by the labels and the feedback; descriptive feedback after undo/redo including skipped items, with no new countdown. Verify: label and feedback tests.

## 3. Lifecycle, docs, release

- [ ] 3.1 Clear both stacks on sign-out; keep 20 across reloads (unchanged cap). Verify: a sign-out test.
- [ ] 3.2 Docs: a short "Undo and redo" page (or section) covering the shortcuts, the controls and the documented limits (local history, last-writer-wins, undoing a creation trashes). Verify: `make docs-check`.
- [ ] 3.3 Changelog fragment `changelog.d/Added/undo-redo-history.md`. Verify: `make repo-check`.
