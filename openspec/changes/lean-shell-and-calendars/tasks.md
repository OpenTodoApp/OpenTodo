# Tasks

## 1. Load the off-path screens on demand

- [x] 1.1 Make `CalendarView`, `SettingsView` and `ImportScreen` lazy routes in `web/src/app/Shell.tsx`, with the row skeleton fallback; `web/src/app/shell.test.tsx` visits Week, Settings and Import and finds each screen after the chunk loads.
- [x] 1.2 Make the project Calendar layout lazy in `web/src/app/task-list/listExtras.tsx`, so `ProjectCalendar` and `CalendarView` leave the entry chunk; `web/src/app/projectCalendar.test.tsx` still opens the layout.
- [x] 1.3 Build with `npm run build` and measure with `node scripts/bundle-budget.mjs --json`: entry 312.4 to 135.0 KB gzip, first load 745.3 to 648.1 KB, under the unchanged 323/746 KB budgets.
- [x] 1.4 Check `internal/web/dist/sw.js`: the new CalendarView, SettingsView, ImportScreen and ProjectCalendar chunks are in the precache; `npm run test:built` covers the built worker.

## 2. Ask for no calendar events while calendars are off

- [ ] 2.1 Read the `calendar-feeds` and `calendar-sync` switches before `api.calendarEvents` in `web/src/lib/calendarFeeds.ts`; while both are off, clear the events, subscriptions and window and resolve `false`.
- [ ] 2.2 Keep the unknown case working: an unreadable switch or a failed switch pair still asks the events route, and a failed events request keeps the existing cache (`web/src/lib/calendarFeeds.test.ts`).
- [ ] 2.3 Update Today's agenda test to answer the switch reads and assert no `/calendar-feeds/events` request while feeds are off, at most one switch check in ten minutes (`web/src/app/todayAgenda.test.tsx`).
- [ ] 2.4 Stub the switch reads in the sync loop test so a calendar signal still refreshes once without a real network call (`web/src/lib/sync.test.ts`).

## 3. Verification

- [ ] 3.1 `npx --yes @fission-ai/openspec@1.13.2 validate --all --strict`.
- [ ] 3.2 `cd web && npm run typecheck`, `npm run lint`, and `make i18n-check` from the repository root (no new string).
- [ ] 3.3 `cd web && npx vitest run src/app/shell.test.tsx src/app/projectCalendar.test.tsx src/app/todayAgenda.test.tsx src/lib/calendarFeeds.test.ts src/lib/sync.test.ts --maxWorkers=4`.
- [ ] 3.4 `cd web && npx vitest run --maxWorkers=4` and `make check`.
