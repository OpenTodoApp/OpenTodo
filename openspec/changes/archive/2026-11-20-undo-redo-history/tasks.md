# Tasks

## 1. History model (done)

- [x] 1.1 The undo and redo stacks as views over the existing `assistantUndo` store. Verified: `web/src/lib/undoRedo.test.ts`, `web/src/lib/undoHistory.test.ts`.
- [x] 1.2 Capture the redo payload (values + field clocks) in `undoBatch`; `redoBatch` replays it. Shared `reverse()`.
- [x] 1.3 `applyBatch` clears the redo stack on a new recorded action (D3).
- [x] 1.4 Clock bookkeeping (D4) both directions: undo-stack `clocks` and redo-stack `redo.clocks` are refreshed when a reversal rewrites a field; a hand change in between is skipped and never refreshed.

## 2. Surfaces (done)

- [x] 2.1 A history controller (`web/src/lib/undoHistory.ts`): `topUndo` / `topRedo` and `useUndoHistory()` live, exposing whether undo/redo is available and the next step's name.
- [x] 2.2 Shortcuts through the registry: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z and Ctrl+Y redo, inert in a text field/editor that owns its undo, and inert when the direction has no history. Verified: `web/src/app/bulk/bulk.test.tsx`.
- [x] 2.3 Undo and Redo as command-palette commands, offered while that direction has history, labelled with the next step's name; the palette is reachable on desktop (the shortcut) and on a phone (the tab bar's Search), so undo survives the toast. No standing overflow menu — the app surfaces global actions through the palette, and it filters out disabled entries, so the commands appear only when the direction is possible (owner decision, 20 Nov). Verified: `web/src/app/palette/undoRedoCommand.test.ts`.
- [x] 2.4 Descriptive feedback after undo/redo including skipped items, no new countdown (`undoToast` / `redoToast`). The step name reuses the batch's stored `label`.

## 3. Lifecycle, docs, release (done)

- [x] 3.1 Clear both stacks on sign-out — covered by `clearDeviceData` → `clearLocalData` (`db.assistantUndo.clear()`). Keeps 20 across reloads (`UNDO_KEEP`).
- [x] 3.2 Docs: the keyboard guide (regenerated) and an "Undo and redo" section in `docs/task-history.md`.
- [x] 3.3 Changelog fragment `changelog.d/Added/undo-redo-history.md`.
