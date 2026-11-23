## 1. Record a deadline change

- [x] 1.1 `deadlineUndoable` in `web/src/lib/undoActions.ts` and `deadlineWithUndo` (with the toast) in `web/src/app/undoable.ts`, used by the When editor's deadline picker and its remove button. Verify: `npx vitest run src/lib/undoActions.test.ts`
- [x] 1.2 Full web suite, typecheck and lint. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
