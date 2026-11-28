## 1. Planner

- [x] 1.1 `MoveTarget.inbox` and `unschedulePatch` in `web/src/lib/bulk.ts`; the sidebar drop, `moveUndoable` and bulk Move to the Inbox use them; a task without a project, due today, dropped on the Inbox joins it, and Undo restores the date (`lib/inboxDrop.test.ts`)
- [x] 1.2 A dated task of a project, and of a shared project (as a copy), lands in the Inbox; a drop on a project keeps the date (`lib/inboxDrop.test.ts`)
- [x] 1.3 The panel picker's "No project" unschedules a task with or without a project (`lib/inboxDrop.test.ts`, `moveUndoable`)
- [x] 1.4 A repeating task keeps its date and the toast says why, in every catalog (`lib/inboxDrop.test.ts`; `make i18n-check`)
- [x] 1.5 Bulk Move to the Inbox reviews and writes the cleared schedule (`lib/inboxDrop.test.ts`)

## 2. Names

- [x] 2.1 The task panel's place says "No project" for a task without a project outside the Inbox (`Facets.tsx` uses the model's `projectName`; `npm test -- task-detail`)
- [x] 2.2 Today and Upcoming grouped by project head project-less tasks "No project" (`lib/listGroups.test.ts`)

## 3. Check

- [ ] 3.1 `npm test` and `npm run build` in web/; `openspec validate --all --strict`
