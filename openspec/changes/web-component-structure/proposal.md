# Proposal

## Why

An audit of the web client (UI-8) found that the main screens grew into single functions that are hard to read, review and test: `TaskListView` was one function of 929 lines (fourteen pieces of state, two dozen memos, ten effects, ten live queries and a grouping memo with eighteen dependencies), `Properties` 349, `CalendarView` 337 and `AssistantPanel` 290, with eight more functions above 200 lines. Grouping rules (Today's overdue, evening and blocked groups, Later, sections, the logbook) lived inside a memo and could only be tested by rendering the whole list. The four screens also queried IndexedDB directly, which a parallel change (UI-13) will forbid under `web/src/app`.

## What Changes

- `TaskListView` becomes a thin component over hooks and bodies in `web/src/app/task-list/`: `useListModel` (live data and derived rows), `useListShortcuts` (the `list`, `board` and `view` key scopes, with their writable checks), `useListDrag` (pointer drag of rows and cards), `useListBindings` (panel, Vim list state, open-task signals, focus that follows the cursor, the stable row handlers) and the bodies `ListGroups` (grouped list, section groups, logbook "Show more") and `ListChrome` (page actions, layout switch, empty states, prompt and dialogs). The memoized `ListRow` is unchanged in `task-list/ListRow.tsx`.
- Which tasks a list holds and how they group become pure functions in `web/src/lib/listGroups.ts` (`tasksForView`, `listGroups`, `sectionBuckets`, `boardColumns`, `siblingPositions`, `sectionOfRows`, `completedBySection`) with unit tests.
- `Properties` splits into `usePropertiesModel` (data and writes), `usePropertyEditing` (which chip is open or revealed, the focus signals) and four chip groups. `CalendarView` splits into `lib/calendarDays.ts` (pure, tested), `app/calendar/` (columns, agenda, planning list, keys) and two hooks. `AssistantPanel` splits into `useAssistantConversation` (thread, consent, composer, stream, review) and the sheet, body and composer files; the old exports stay available from `AssistantPanel.tsx`.
- The four screens no longer import `lib/db`: their queries are hooks in `web/src/lib/liveData.ts` (`useLiveProjects`, `useAllLabels`, `useMemberships`, `useProjectSectionRows`, `useLiveSections`, `useProjectViewMode`, `useCollapsedSections`, `useListColumnsPref`, `useProjectTasks`, `useReminderCount`, `useCalendarEvents`, `useCalendarSubscriptions`, `useShowEvents`, `useCachedEventsWindow`, `useGridPrefs`) and two one-shot reads (`getTask`, `readGridPrefs`), each with the query, default and dependencies the screen had.
- ESLint's `max-lines-per-function` (250 lines, outside tests, stories and test kits) runs in `npm run lint` / `make web-lint`. The six functions already longer (Sidebar, AuthScreen, TimelineView, App, FilterView and the Dexie constructor) are allow-listed by file with a ceiling and a reason.

No behaviour, op schema, API or data model change; no new dependency; no new environment variable. Not **BREAKING**.

**Out of scope**: splitting the allow-listed functions and the other functions between 200 and 250 lines (MonthView, AuditPanel, TriageView, Shell, TaskDetail, BackupsPanel); forbidding `lib/db` in `web/src/app` (UI-13, a parallel change); moving `app/overlay` into `ui` (UI-12). ROADMAP.md item advanced: none; this is maintenance of existing screens.
