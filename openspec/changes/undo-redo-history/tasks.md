# Tasks

## 1. History model (done)

- [x] 1.1 The undo and redo stacks as views over the existing `assistantUndo` store. Verified: `web/src/lib/undoRedo.test.ts`, `web/src/lib/undoHistory.test.ts`.
- [x] 1.2 Capture the redo payload (values + field clocks) in `undoBatch`; `redoBatch` replays it. Shared `reverse()`.
- [x] 1.3 `applyBatch` clears the redo stack on a new recorded action (D3).
- [x] 1.4 Clock bookkeeping (D4) both directions: undo-stack `clocks` and redo-stack `redo.clocks` are refreshed when a reversal rewrites a field; a hand change in between is skipped and never refreshed.

## 2. Surfaces

- [x] 2.1 A history controller (`web/src/lib/undoHistory.ts`): `topUndo` / `topRedo` over the store and `useUndoHistory()` live, exposing whether undo/redo is available and the next step's name.
- [x] 2.2 Shortcuts through the registry: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z and Ctrl+Y redo, inert in a text field/editor that owns its undo (the dispatcher's typing exclusion), and inert when the direction has no history. Verified: `web/src/app/bulk/bulk.test.tsx` ("Ctrl+Z undoes outside text fields", "Ctrl+Shift+Z redoes").
- [ ] 2.3 Undo and Redo as command-palette commands and overflow-menu items, disabled when empty, labelled with the next step's name.
- [x] 2.4 Descriptive feedback after undo/redo including skipped items, no new countdown (`undoToast` / `redoToast` reuse the toast). The named-step describer for the 2.3 labels lands with 2.3.

## 3. Lifecycle, docs, release

- [x] 3.1 Clear both stacks on sign-out — already covered: `clearDeviceData` → `clearLocalData` calls `db.assistantUndo.clear()`. Keeps 20 across reloads (`UNDO_KEEP`).
- [~] 3.2 Docs: keyboard guide regenerated (`make docs`, Undo/Redo rows). A short "Undo and redo" prose section lands with the controls (2.3).
- [ ] 3.3 Changelog fragment (lands with the controls, describing the whole feature). Verify: `make repo-check`.
