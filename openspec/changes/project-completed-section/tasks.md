## 1. Preference

- [x] 1.1 `loadShowCompleted` / `saveShowCompleted` per project in Dexie meta (`lib/sections.ts`), `useShowCompletedPref` (`lib/liveData.ts`)
- [x] 1.2 "Show completed tasks" check item in the Project menu, list layout only (`ProjectHeader.tsx`)

## 2. Completed group

- [x] 2.1 `completedNewestFirst` and `completedOpenKey` (`lib/listGroups.ts`); the model exposes the group's tasks and open state (`useListModel.ts`)
- [x] 2.2 The Completed group at the end of the list, closed by default, also in the columns layout (`ListGroups.tsx`, `TaskListView.tsx`)
- [x] 2.3 Sections offer no "n completed" while the group is on
- [x] 2.4 Tests: `projectCompleted.test.tsx` (off by default, closed with count, newest first, complete and reopen, sections, the menu switch)

## 3. Ticked circle

- [x] 3.1 A completed task's circle drops the priority ring (`TaskRow.tsx`, `TaskDetail.tsx`, the panel story)

## 4. Docs and checks

- [x] 4.1 `docs/completed-in-projects.md` with the `project-completed` screenshot scene, listed in `docs/README.md`; translations; CHANGELOG
- [x] 4.2 `npm test`, `npm run lint`, `npx tsc -b`, `make ui-lint`, `make i18n-check`, `make docs-check`, visual baselines in the pinned Playwright image
