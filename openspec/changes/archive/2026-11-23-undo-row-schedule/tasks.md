## 1. Record the Schedule sheet and Park in Someday

- [x] 1.1 `RowScheduleSheet` (`web/src/app/task-list/RowSwipe.tsx`) through `calendarEditWithUndo` and `parkWithUndo`; the palette's `task:park` and `useListKeys`' `list.park` through `parkWithUndo`; `parkUndoable` hands a repeating task to `parkTask`. Verify: `npx vitest run src/app/rowSwipe.test.tsx src/app/palette/registry.test.tsx src/app/useListKeysTrash.test.tsx src/lib/undoActions.test.ts` (fail before the change)
- [x] 1.2 Full web suite, typecheck and lint, `make docs`. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
