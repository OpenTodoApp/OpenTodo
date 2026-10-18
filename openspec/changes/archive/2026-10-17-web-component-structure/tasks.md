# Tasks

## 1. Task list (UI-8)

- [x] 1.1 Pure list functions in `web/src/lib/listGroups.ts` (`tasksForView`, `listGroups`, `sectionBuckets`, `boardColumns`, `siblingPositions`, `sectionOfRows`, `completedBySection`, `flatRow`, `BLOCKED_OPEN_KEY`) — verified by `src/lib/listGroups.test.ts` (12 tests: archived projects, logbook order, Today's groups and folded Blocked group, project grouping, tree and Later, sections, board columns, logbook notes, breadcrumbs, sibling positions, completed by section).
- [x] 1.2 Split `TaskListView` into `task-list/useListModel`, `useListShortcuts`, `useListDrag`, `useListBindings`, `ListRow`, `ListGroups` and `ListChrome`; `TaskListView` 929 → 186 lines — verified by the existing list tests unchanged (listPerformance render count, assistiveSemantics, uiCorrectness writable checks, bulk, undo, logbook, groups, fieldsList, timelineView, somedayViews, deadlineViews, dependencyViews, habits, budget, firstRun, subProjects, projectNote, taskRow, templateDialogs, vim, display entries: 26 files, 164 tests).

## 2. Properties, calendar, assistant (UI-8)

- [x] 2.1 `Properties` → `usePropertiesModel`, `usePropertyEditing` and four chip groups; 349 → 87 lines at most — verified by the task-detail tests (20 files, 127 tests, propertyChips and priority included).
- [x] 2.2 `CalendarView` → `lib/calendarDays.ts`, `app/calendar/` (DayColumn with TaskBlock and OverflowStack, WeekAgenda, PlanPanel, useCalendarKeys, grid) and two hooks; 337 → 151 lines — verified by `src/lib/calendarDays.test.ts` and `calendarView.test.tsx`.
- [x] 2.3 `AssistantPanel` → `useAssistantConversation` (with `useConsent`, `useReview`, `useComposerState`, `streamAnswer`), `AssistantSheet`, `AssistantPanelBody`, `AssistantComposer`, `useSentenceAnnouncer`; 290 → 53 lines (useAssistantConversation 134); old exports kept — verified by `assistantPanel.test.tsx` and `assistantSkills.test.tsx`.

## 3. Data access through `lib`

- [x] 3.1 Live reads of the four screens as hooks in `web/src/lib/liveData.ts` (plus `getTask`, `readGridPrefs`); thread types re-exported from `lib/assistant`; no file of the four screens or their new parts imports `lib/db` — verified by `grep "lib/db'"` over them returning nothing and the tests above.

## 4. Size limit

- [x] 4.1 `max-lines-per-function` (250, IIFEs counted; tests, stories and test kits exempt) in `web/eslint.config.js`, with a commented ceiling for Sidebar, AuthScreen, TimelineView, App, FilterView and the Dexie constructor — verified by `npm run lint` passing, and failing on the four screens as they were (TaskListView 929, Properties 349, CalendarView 337, AssistantPanel 290 lines).
- [x] 4.2 CONTRIBUTING.md names the limit; CHANGELOG entry under Changed.

## 5. Checks

- [x] 5.1 `tsc -b`, `npm run lint`, full vitest suite (twice or more), `make ui-lint`, `make i18n-check`, `npm run build`, `make openspec-validate`.
- [x] 5.2 Chromium layout check (`scripts/e2e-layout.mjs`, 360/390/768 px, light and dark) and `scripts/e2e-smoke.mjs`, `scripts/e2e-views.mjs` against fresh servers.
- [x] 5.3 Bundle: main chunk 1,048,590 → 1,058,917 bytes (+10.3 KB, +3.6 KB gzip, about 1 %) from the extra component and hook boundaries; chunk count unchanged (40); no new dependency.
