## 1. Record an assignee change

- [x] 1.1 `assigneeUndoable` in `web/src/lib/undoActions.ts` and `assigneeWithUndo` (with the toast) in `web/src/app/undoable.ts`, used by the assignee picker (the panel's and the list's Assign), the Assignee editor's remove button and solo switch, and the panel's solo Assignee facet. Verify: `npx vitest run src/lib/undoActions.test.ts`
- [x] 1.2 Full web suite, typecheck and lint. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
