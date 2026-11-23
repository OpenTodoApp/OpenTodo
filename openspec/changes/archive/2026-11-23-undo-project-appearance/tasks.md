## 1. Record a project's name, colour and icon

- [x] 1.1 `projectEditUndoable` and `projectRenameUndoable` in `web/src/lib/undoActions.ts`; `web/src/app/menus/projectAppearance.tsx` and `web/src/app/palette/registry.ts` use them. Verify: `npx vitest run src/lib/undoActions.test.ts src/app/sidebarAppearance.test.tsx` (fail before the change)
- [x] 1.2 Full web suite, typecheck and lint, `make docs`. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
