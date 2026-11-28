## 1. Planner

- [x] 1.1 `MoveTarget.inbox` and `unschedulePatch` in `web/src/lib/bulk.ts`; the sidebar drop, `moveUndoable` and bulk Move to the Inbox use them; a task without a project, due today, dropped on the Inbox joins it, and Undo restores the date (`lib/inboxDrop.test.ts`)
- [x] 1.2 A dated task of a project, and of a shared project (as a copy), lands in the Inbox; a drop on a project keeps the date (`lib/inboxDrop.test.ts`)
- [x] 1.3 The panel picker's "No project" unschedules a task with or without a project, Undo restores project and date together, and an unscheduled task writes nothing (`lib/inboxDrop.test.ts`)
- [x] 1.4 The edit bar's "No project" on a dated task without a project puts it in the Inbox (`app/task-list/inlineEditor.test.tsx`); `ProjectPickerField` reports the repeated pick only with `repickNone` (`app/projectPickerField.test.tsx`)
- [x] 1.5 A repeating task keeps its whole schedule and loses only its project, and the toast names it (`=1`) or counts the topmost repeating tasks in each language's plural forms, Japanese and Russian at 1, 5 and 21 included (`lib/inboxDrop.test.ts`; `make i18n-check`)
- [x] 1.6 Bulk Move to the Inbox reviews and writes the cleared schedule and counts the repeating tasks for the result; with only repeating tasks without a project, the note still shows (`lib/inboxDrop.test.ts`)
- [x] 1.7 A move to another workspace's Inbox keeps the schedule; a drop into a "No project" group names the group's heading (`useListScreen.tsx`, `SavedViewView.tsx`)

## 2. Names

- [x] 2.1 The task panel's place says "No project" for a task without a project outside the Inbox (`Facets.tsx` uses the model's `projectName`; `npm test -- task-detail`)
- [x] 2.2 Today, Upcoming, Someday, Anytime, labels, saved views and Completed head tasks without a project "Inbox" only when all are Inbox tasks (`lib/listGroups.test.ts`, `lib/views.test.ts`, `app/completedReview.test.tsx`)

## 3. Check

- [x] 3.1 The touched vitest suites, `tsc`, eslint, `make i18n-check` and `openspec validate --all --strict`
