## 1. Record a rename

- [x] 1.1 `titleUndoable` (on `plainEditUndoable`) in `web/src/lib/undoActions.ts`, used by `commitTitleEdit` in `web/src/app/titleEdit.ts` for a title-only edit. Verify: `npx vitest run src/app/titleEdit.test.ts` (fails before the change)
- [x] 1.2 Full web suite, typecheck and lint. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
