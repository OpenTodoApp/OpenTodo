## 1. Record a priority change

- [x] 1.1 `priorityUndoable` in `web/src/lib/undoActions.ts` (planned from the one task, no whole-table read; a repeating task through `updateTask`), used by the list keys, the task panel, the row menu, the palette and Vim. Verify: `npx vitest run src/lib/undoActions.test.ts`
- [x] 1.2 Full web suite, typecheck and lint. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
