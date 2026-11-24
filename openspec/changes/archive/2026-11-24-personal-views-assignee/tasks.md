## 1. Web app

- [x] 1.1 One predicate on the viewer's id; Today, Upcoming, Start with Today and the display's next days leave out tasks assigned to someone else (`dayLists.test.ts`)
- [x] 1.2 Today, Upcoming, Someday and Anytime in `tasksForView` and `patchViewTasks`, the project and Assigned to me unchanged, a reassignment leaving and returning (`listGroups.test.ts`, `incrementalEquivalence.test.ts`)
- [x] 1.3 The sidebar Today count, the app icon badge, the briefing, the palette's Earlier, Close the day, the daily check and the shell widgets use the same rule (`appBadge.test.tsx`, `briefing.test.ts`, `incrementalEquivalence.test.ts`)
- [x] 1.4 Today's menu has no Hide / Show tasks assigned to others; someone else's task is not listed (`todayAgenda.test.tsx`)
- [x] 1.5 The on-device assistant's `today_summary` leaves them out (`assistantDevice/tools.test.ts`)

## 2. Server

- [x] 2.1 `today_summary` leaves them out of `overdue`, `due_today` and their counts, the project counts unchanged (`go test ./internal/agenttools -run TodaySummary`); tool description and golden files updated (`go test ./internal/agenttools ./internal/mcp ./internal/assistant`)

## 3. Docs and check

- [x] 3.1 `docs/today-and-upcoming.md` and the changelog fragment; `make docs` and `make docs-check`
- [x] 3.2 `npm test` and `npm run build` in web/, `go test ./...`, `make check`
