## 1. Record the move

- [x] 1.1 The palette's `task:workspace:<id>` command (`web/src/app/palette/registry.ts`) and `offerMoveToWorkspace`'s action (`web/src/app/workspaceNav.ts`) call `moveWithUndo` with the target workspace. Verify: `npx vitest run src/app/workspaces.test.tsx` (fails before the change)
- [x] 1.2 Full web suite, typecheck and lint. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
