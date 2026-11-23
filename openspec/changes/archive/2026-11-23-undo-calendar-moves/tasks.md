## 1. Record a calendar move

- [x] 1.1 `calendarEditUndoable` in `web/src/lib/undoActions.ts`, used by the keyboard moves of `MonthView.tsx`, `PlanView.tsx`, `calendar/useCalendarKeys.ts`, `calendar/monthSpans.tsx` and the timeline's keys; `calendarEditWithUndo` (with the toast) in `web/src/app/undoable.ts` for the timeline's drags. Verify: `npx vitest run src/lib/undoActions.test.ts src/app/monthView.test.tsx src/app/timelineView.test.tsx` (fails before the change)
- [x] 1.2 Full web suite, typecheck and lint. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
