## 1. Record the panel's Start, Multi-day and zone edits

- [x] 1.1 The Start date picker and `MultiDaySwitch` in `web/src/app/task-detail/WhenControl.tsx`, and `ZoneControl`'s write, through `calendarEditUndoable`. Verify: `npx vitest run src/app/task-detail/whenControl.test.tsx src/app/task-detail/zoneControl.test.tsx` (fail before the change)
- [x] 1.2 Full web suite, typecheck and lint, `make docs`. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
