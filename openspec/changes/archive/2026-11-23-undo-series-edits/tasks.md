## 1. Steps for repeating tasks

- [x] 1.1 `planTaskEdit`, `editTakesScope` and `planRecurrence` in `web/src/lib/ops.ts`; `seriesEditUndoable` and `recurrenceUndoable` in `web/src/lib/undoActions.ts`, used by the single-edit families; the repeat field, its presets and Stop repeating call `recurrenceUndoable`. Verify: `npx vitest run src/lib/undoActions.test.ts` (the new cases fail before the change)
- [x] 1.2 Full web suite, typecheck and lint, `make docs`. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
