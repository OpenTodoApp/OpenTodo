## 1. Share in the sidebar menu

- [x] 1.1 `shareItem` from `web/src/app/menus/useProjectMenu.tsx`, used by `web/src/app/ProjectHeader.tsx` and first in `web/src/app/ProjectRowMenu.tsx`. Verify: `npx vitest run src/app/sidebarAppearance.test.tsx` (fails before the change)
- [x] 1.2 Full web suite, typecheck and lint, `make docs`. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
