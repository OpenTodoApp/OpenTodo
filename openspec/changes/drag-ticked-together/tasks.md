## 1. Moves

- [ ] 1.1 `planMoveMany` in `web/src/lib/ordering.ts` and `moveTasks` in `web/src/lib/move.ts` (D1, D3): roots, pop-outs, carried subtrees, one `mutateMany`, cycle and permission guards. Verify: `cd web && npx vitest run src/lib/ordering.test.ts src/lib/move.test.ts` with each scenario of "Drag several ticked tasks within a list".
- [ ] 1.2 `useListDrag`: the ticked set as the dragged set among rows, carried subtrees excluded as targets, drops on a ticked row redirected (D2); the bulk toast with Undo; the count chip on the preview (D4). Verify: a list drag test per scenario, offline included.

## 2. Docs and checks

- [ ] 2.1 The count string in every locale, a story for the preview, `docs/bulk-actions.md`, `changelog.d/Added/drag-ticked-together.md`, the row in `ROADMAP.md`. Verify: `make i18n-check`, `make docs`, `make docs-check`, `make openspec-validate`, `cd web && npm test && npm run build`, `make bundle-budget`, `make ui-check`.
