## 1. Record a skip

- [x] 1.1 `skipOccurrence` in `web/src/lib/undoActions.ts` (moved from `web/src/lib/ops.ts`); its callers import it from there. Verify: `npx vitest run src/lib/undoActions.test.ts` (fails before the change)
- [x] 1.2 Full web suite, typecheck and lint, `make docs`. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
