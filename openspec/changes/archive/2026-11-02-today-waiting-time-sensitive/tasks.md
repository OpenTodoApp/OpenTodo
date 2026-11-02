## 1. Rule

- [x] 1.1 `timeSensitive` in `web/src/lib/closedList.ts` and `TimeSensitive` in `internal/closedlist`, with two new cases in `closedList.vectors.json`; verified by `npx vitest run src/lib/closedList.test.ts` and `go test ./internal/closedlist`

## 2. Today

- [x] 2.1 The folded Waiting group carries the time-sensitive tasks and the "next" words (`web/src/lib/listGroups.ts`); verified by `src/lib/listGroups.test.ts`
- [x] 2.2 `ListGroupHeader` `detail` and `WaitingSoonList` with Take a slot, the full refusal, "n more with a time", the opened group as before; verified by `src/app/waitingSoon.test.tsx`
- [x] 2.3 Strings in all six languages; verified by `make i18n-check`
- [x] 2.4 Stories (`ListGroupHeader` FoldedWithDetail, Screens/Task list TodayWaitingWithTimes, the phone's Today with a limit) and their baselines; verified by `make ui-check` (a11y and visual) and `make ui-lint`

## 3. CLI and agent tools

- [x] 3.1 `today_summary` `time_sensitive` and `waiting_time_sensitive`; verified by `TestTodaySummaryTimeSensitive` and the MCP tools/list golden
- [x] 3.2 `ot today` heading, the time-sensitive lines and `--json` `time_sensitive`; verified by `TestTodayTimeSensitive`

## 4. Docs

- [x] 4.1 `docs/today-limit.md`, `docs/cli.md`, `docs/mcp.md`, CHANGELOG; verified by `make docs-check`; `go test ./...`, `npm test` and `npm run build` in web/
