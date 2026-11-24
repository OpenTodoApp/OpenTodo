## 1. Record an estimate change

- [x] 1.1 `estimateUndoable` (on a shared `plainEditUndoable`) in `web/src/lib/undoActions.ts`, used by the task panel's Estimate field and its remove button; `estimateWithUndo` with the toast for the calendar block's lower edge. Verify: `npx vitest run src/lib/undoActions.test.ts`
- [x] 1.2 Full web suite, typecheck and lint. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
