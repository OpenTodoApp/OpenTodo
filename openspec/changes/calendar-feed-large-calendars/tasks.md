# Tasks

## 1. Server

- [x] 1.1 `caldav.Stream` and the shared tree builder; `ParseWithLimits` on the builder. Verify: `go test ./internal/caldav/...` (`TestStreamMatchesParse` over every fixture, `TestStreamRefuses`, `TestStreamHoldsOneChild`, the existing fold-bomb test).
- [x] 1.2 `calfeed.ReadCalendar`, `Reaches`, the new limits, `Fetch` streaming the body. Verify: `go test ./internal/calfeed/...` (`TestFetchLargeCalendarKeepsTheWindow` with a generated 10 MB calendar, `TestReadCalendarMemory`, `TestFetchOverTheLimit`, `TestReachesRecurring`, `TestReadCalendarKeptLimit`, `TestFetchOutcomes`), a 20-second run of `FuzzParseAndExpand`, `go test ./internal/calsync/... ./internal/httpapi/...`, `go test ./...`.

## 2. Web app

- [x] 2.1 The Calendar feeds screen words `too_large` with the limit and calendar sync; the string in every catalogue. Verify: `npx vitest run src/app/calendarFeedsSettings.test.tsx`, `make i18n-check`.

## 3. Docs and release

- [x] 3.1 `docs/other-calendars.md` and `docs/security/threat-model.md` state the new limits. Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Fixed/calendar-feed-large-calendars.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
