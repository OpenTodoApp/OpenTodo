## 1. Preference

- [x] 1.1 `internal/sync/ops.go`: additive `user_prefs.today_events` string; `internal/sync/testdata/schema_fixture.json`; `go test ./internal/sync/...` passes
- [x] 1.2 `web/src/lib/types.ts`, `web/src/lib/ops.ts` defaults, `web/src/lib/userPrefs.ts` `todayEventsShown` and `setTodayEventsShown`; unit test: empty and unknown read as off

## 2. Agenda

- [x] 2.1 `calendar/useNowMinutes.ts` moved out of `CalendarView.tsx`; `EventDetails` exported from `CalendarEvents.tsx`; calendar tests still pass
- [x] 2.2 `calendar/TodayAgenda.tsx`: the data hook (today's range, throttled refresh, enabled subscriptions, ignores the device toggle) and the block (all-day chips, timed rows, free outline, past dimmed, popover, freshness line); `.ui-event-past` in `index.css`
- [x] 2.3 `TaskListView.tsx`: the menu item on Today only when a subscription is known, and the block after the quick add
- [x] 2.4 Strings in the six catalogs; `make i18n-check`
- [x] 2.5 Tests `todayAgenda.test.tsx` (happy-dom): option off shows no agenda; on shows all-day first, timed in order, free outline, past dimmed, details open; no events shows no block; no subscription shows no item; offline shows "Calendars as of"; the choice is a `user_prefs` op; `npm test`
- [x] 2.6 Story `calendar/todayAgenda.stories.tsx` and its baselines (`make ui-baselines` limited to it); `make ui-lint`

## 3. Docs and checks

- [x] 3.1 `docs/today-and-upcoming.md` and `docs/other-calendars.md`; `make docs-check`
- [x] 3.2 CHANGELOG Unreleased "Added"
- [x] 3.3 `npm run build`, typecheck, `make openspec-validate`
