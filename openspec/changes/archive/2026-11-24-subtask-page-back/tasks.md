## 1. History on the task page

- [x] 1.1 `openTaskPage` in `web/src/app/taskTrail.ts` pushes a task opened from a task page unless it is a step, stamps its entry with `taskStep`, and `leaveTaskPage` goes back past the stamped steps. Verify: `npx vitest run src/app/taskPage.test.tsx` (the subtask Back test fails before the change)
- [x] 1.2 Web app tests, typecheck and lint, `make docs`. Verify: `npx vitest run src/app`, `npm run typecheck` in `web/`
