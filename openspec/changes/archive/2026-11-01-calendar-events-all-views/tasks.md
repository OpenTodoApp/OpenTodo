# Tasks

## 1. Data

- [x] 1.1 `fetchRange` and `requestRanges` in `web/src/lib/calendarFeeds.ts`: a wider window fetched in pieces of at most 92 days, merged by id (D5); verify `npm test` (`calendarFeeds.test.ts`, "fetches a year ... in pieces")
- [x] 1.2 `eventsByDay` in `web/src/lib/calendar.ts` with the rules of `allDayEvents` and `eventBlocks` (D1); verify `npm test` (`calendar.test.ts`, "events by day for Month and Year")

## 2. Views

- [x] 2.1 `EventRow` variants `plan`, `agenda`, `cell` (D3) and `CalendarsToggle` shared by Day, Week, Plan, Month and Year (D6); verify `npm test` (the existing Plan and calendar tests)
- [x] 2.2 The phone's Week agenda lists all-day and timed events (D2); verify `calendarEventsAllViews.test.tsx` ("Week on a phone")
- [x] 2.3 Month cells, "+N more", the cell's name, the phone ring and day list, the header's toggle and status, fetching always (D2, D4, D6); verify `calendarEventsAllViews.test.tsx` ("Month")
- [x] 2.4 Year event ring, accessible name, tip, phone month names, toggle and status (D4, D6); verify `calendarEventsAllViews.test.tsx` ("Year")
- [x] 2.5 Strings in the six catalogues; verify `make i18n-check`

## 3. Checks

- [x] 3.1 The layout check answers the events route with a fixed calendar (`scripts/ux-audit/seed.mjs` `calendarEvents`); verify `make layout-check` with `ONLY=day,week,month,month-september,plan,year`
- [x] 3.2 Docs: `docs/calendar-feeds.md` and the calendar guide; verify `make docs-check`
- [x] 3.3 `npm test`, `npm run build`, `make bundle-budget`, `make openspec-validate`, `make check`; CHANGELOG Unreleased entry at archive
