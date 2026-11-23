## 1. Record indent, outdent and the Parent task

- [x] 1.1 `planTaskParent` in `web/src/lib/ops.ts`, `parentUndoable` in `web/src/lib/undoActions.ts`; `useListShortcuts.ts` (Tab, Shift-Tab) and `usePropertiesModel.ts` (Parent task) use it. Verify: `npx vitest run src/lib/undoActions.test.ts src/app/bulk/bulk.test.tsx` (fail before the change)
- [x] 1.2 Full web suite, typecheck and lint, `make docs`. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
