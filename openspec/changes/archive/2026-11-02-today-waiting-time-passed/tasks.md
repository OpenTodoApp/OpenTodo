## 1. Rule

- [x] 1.1 `timeSensitive(waiting, today, now)` with `passed`, `nextWaiting` and `waitingNow` in `web/src/lib/closedList.ts`; `TimeSensitive(waiting, today, now)`, `Next` and `Passed` in `internal/closedlist`; `now`, `passed` and `next` in `closedList.vectors.json` with three new cases (some passed, every one passed, after midnight before the day start); verified by `npx vitest run src/lib/closedList.test.ts` and `go test ./internal/closedlist`

## 2. Today

- [x] 2.1 The folded group's entries carry `passed`, and its heading names the next one not passed, or says every time passed (`web/src/lib/listGroups.ts`); verified by `src/lib/listGroups.test.ts`
- [x] 2.2 `WaitingSoonList` marks a passed entry with its time in the danger tone and "Time passed"; verified by `src/app/waitingSoon.test.tsx`
- [x] 2.3 `useWaitingNow` reads now on each minute boundary while tasks wait and none otherwise; verified by `src/app/task-list/useWaitingNow.test.tsx`
- [x] 2.4 Strings in all six languages; verified by `make i18n-check`

## 3. CLI and agent tools

- [x] 3.1 `today_summary` `time_passed`; verified by `TestTodaySummaryTimeSensitive`
- [x] 3.2 `ot today` heading words, "(time passed)" and `--json` `time_passed`; verified by `TestTodayTimeSensitive` and `TestTodayTimePassed`

## 4. Docs

- [x] 4.1 `docs/today-limit.md`, `docs/cli.md`, `docs/mcp.md`, CHANGELOG; verified by `make docs-check`; `go test ./...`, `npm test` and `npm run build` in web/
