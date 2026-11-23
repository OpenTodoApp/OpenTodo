## 1. Record a quick-add creation

- [x] 1.1 `createTaskThenSuggest` (quick add in a list, the quick add sheet, the command bar) creates the task as one recorded batch through `addTaskUndoable`. Verify: `npx vitest run src/lib/pasteTasks.test.ts src/lib/assistantSuggest.test.ts`
- [x] 1.2 Full web suite, typecheck and lint. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
