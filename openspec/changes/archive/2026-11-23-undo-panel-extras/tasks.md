## 1. Record a location and Remove origin

- [x] 1.1 `locationUndoable` and `originRemovedUndoable` (on `plainEditUndoable`, which now compares objects by their keys) in `web/src/lib/undoActions.ts`; `setTaskLocation` in `web/src/lib/locations.ts` and Remove origin in `web/src/app/task-detail/TaskActionsMenu.tsx` use them. Undo skips steps for fields this device can't decrypt, in `applyBatch` (`web/src/lib/undo.ts`). Verify: `npx vitest run src/lib/locations.test.ts src/app/task-detail/facets.test.tsx src/lib/undoActions.test.ts` (fail before the change)
- [x] 1.2 Full web suite, typecheck and lint, `make docs`. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
