# Tasks

## 1. Synced field (design D1)

- [x] 1.1 Add `day_start` (`kString`, comment citing this change and the `HH:MM` 00:00–06:00 contract) to `user_prefs` in `internal/sync/ops.go` `Schema`, and extend `internal/sync/userprefs_test.go` with an op writing `day_start: "04:00"` that lands in the author's personal scope only and converges by `(ts, device)` against a concurrent `"02:00"`; verify with `go test ./internal/sync/...`
- [x] 1.2 Add `day_start: string` to `UserPrefs` in `web/src/lib/types.ts`, `day_start: ''` to `USER_PREFS_DEFAULTS` in `web/src/lib/ops.ts`, and `DAY_STARTS` (`'00:00'`…`'06:00'`), `readDayStart(row): number` (minutes; `''`, `09:00`, `4am` → 0; `03:30` → 210) and the `day_start` case of `setUserPref` in `web/src/lib/userPrefs.ts`; verify with unit tests in `web/src/lib/userPrefs.test.ts` (or the existing prefs test) covering each value and `npm test`
- [x] 1.3 Add the `day_start` row to the `user_prefs` entity table in `docs/sync.md` and confirm the export and importer round trip carries it unchanged by extending `internal/importer/userprefs_test.go` with the new field; verify with `go test ./internal/importer/... ./internal/httpapi/...` and `make docs-check`

## 2. The logical day (design D2, D3, D4, D8)

- [x] 2.1 Add `logicalDay(ms, dayStartMinutes)`, `logicalToday(dayStartMinutes?, now?)`, `setDayStart`/`currentDayStart` to `web/src/lib/dates.ts` without changing `todayISO`; verify with `web/src/lib/dates.test.ts` cases: 01:30 with 240 → previous day, 04:00 → same day, 0 → `todayISO`, a month and a year boundary, and the 2026-03-29 and 2026-10-25 nights in `Europe/Zurich` (via `dayInZone` composition), run with `npm test -- dates`
- [x] 2.2 Publish the day start from `web/src/app/DateTimePrefsProvider.tsx` (`readDayStart(row)` in the memo key, `setDayStart` during render, `dayStart` in the context value) and make `useToday()` in `web/src/app/useViews.ts` return `logicalToday(dayStart)` with `dayStart` in its effect dependencies; verify with a component test that writes `day_start: "04:00"` through `mutate` at a faked 01:30 and sees `useToday()` and the Today view move to the previous date without a reload (`npm test -- useToday`)
- [x] 2.3 Switch the day-of-instant helpers to `logicalDay(ms, currentDayStart())`: `deviceDay` in `web/src/lib/stats.ts`, `dayOf` in `web/src/lib/method/pulse.ts`, the group date in `web/src/lib/logbook.ts`, `completedOn` in `web/src/lib/dayLists.ts`, `dailyDue` and `reviewAgo` in `web/src/lib/review.ts`; verify with tests at a faked day start of 240 minutes: a completion at 01:30 counts for the previous day in `stats.test.ts` ("Completed after midnight is not late"), `logbook.test.ts` (grouped under the previous day), `pulse.test.ts` (the strip) and `review.test.ts` (`dailyDue` false at 00:30 after an evening check), `npm test`
- [x] 2.4 Switch the write-side defaults (design D5) to `logicalToday()`: `completeTask`, `skipOccurrence`, `detachOccurrence`, `setRecurrence` in `web/src/lib/ops.ts`; `planComplete`, `dateOfPick`, `planDue` in `web/src/lib/bulk.ts`; `web/src/lib/undoActions.ts`; the reference date in `web/src/app/QuickAdd.tsx`, `QuickAddSheet.tsx`, `TriageView.tsx` (`t`), `vim/VimLayer.tsx`, `TaskRow.tsx` ("Starts/Started"), `task-detail/Properties.tsx` (deadline countdown), `datetime/DateField.tsx` (relative words and placeholder); verify with `recurring.test.ts` showing "every 3 days after completion" completed at 01:30 with a 04:00 day start is next due three days after the logical day, the habit scenario "Done after midnight with a day start" in `habits.test.ts` (record for the 14th, series on the 15th, streak counted, not at risk), and `npm run build`
- [x] 2.5 Add a guard test `web/src/lib/todayGuard.test.ts` that fails on a bare `todayISO()` call outside `lib/dates.ts` and the allow-list from design D8 (`DateTimeSettings.tsx`, `RemindersField.tsx`, `listActions.ts`, `templates.ts`, `display/Clock.tsx`, `display/DisplayScreen.tsx`); verify it fails on a planted call and passes on the tree (`npm test -- todayGuard`)
- [x] 2.6 Make Display mode follow the preference: `web/src/app/display/DisplayScreen.tsx` and `Clock.tsx` compute `today` with `logicalDay(now, dayStart)` from the provider; verify with the display test at a faked 01:30 and `day_start: "04:00"` showing the previous date and `completedOn` for it (`npm test -- display`)

## 3. Settings panel (design D7)

- [x] 3.1 Add the "My day starts at" `SettingRow` to `web/src/app/DateTimeSettings.tsx`: a `Select` over `DAY_STARTS` labelled with `formatTime` ("Midnight (default)" for `00:00`), the explanation line, and a "Today" line in the preview from `logicalToday()`; verify with `web/src/app/dateTimeSettings.test.tsx`: choosing `04:00` writes `day_start: "04:00"` through the op log, the preview names the previous date at a faked 01:30, arrow keys change the value, and axe passes (`npm test -- dateTimeSettings`)
- [x] 3.2 Add the new strings to the six catalogs under `web/src/locales/` (de, es, fr, it, pt and the source `messages.json`); verify with `make i18n-check`
- [x] 3.3 Update the "Date and time" section of `docs/settings-app.md` and `docs/dates-and-times.md` (what the day start changes and what it does not: due dates, reminders, time zones), and regenerate the help bundle; verify with `make docs-check`

## 4. Server digest (design D6)

- [x] 4.1 Add `DayStart(pref string) int` (minutes, 0 on anything invalid or out of range) and `Input.DayStart` to `internal/digest/stats.go`, apply it in `Input.dayOf` and in `Service.input`'s `Today`, and read `day_start` next to `week_start` in `Service.Build`; verify with `go test ./internal/digest/...` including a table test for `DayStart` (`""`, `"04:00"`, `"03:30"`, `"09:00"`, `"4am"`)
- [x] 4.2 Extend `internal/digest/testdata/stats_fixture.json` with `"dayStart": "04:00"` and two cases: a completion at 01:30 on the Monday that starts a week counts in the previous week, and one at 04:00 counts in the new week; make `internal/digest/stats_test.go` pass `DayStart` and `web/src/lib/stats.test.ts` pass `dayOf = (ms) => logicalDay(ms, minutes)` composed with `dayInZone`; verify both suites agree (`go test ./internal/digest/...`, `npm test -- stats`)
- [x] 4.3 Add one sentence to the digest section of `docs/notifications.md` (the digest counts days from the user's day start) and a note to the recurring completions section of `docs/api.md` (the server keys occurrence records by the due date and uses its own calendar date for catch-up); verify with `make docs-check`

## 5. Statistics, habits and rhythms docs

- [x] 5.1 Update `docs/statistics.md` (days begin at the day start; the Loop pulse and the digest follow), `docs/recurrence.md#habits` (a habit done after midnight before the day start is recorded for its due date and counts for that day) and `docs/method/rhythms.md` (the Daily check and today's focus last until the day start); verify with `make docs-check`

## 6. Integration

- [x] 6.1 Manual smoke on `make dev` with the browser clock faked to 01:30 (DevTools sensors or a `Date` override in the console): set the day start to `04:00`, check Today, Upcoming, Completed, Statistics, a habit's month grid, the Loop home's focus and pulse, the sidebar markers; then confirm a second profile signed into the same account picks the preference up after sync; record the result in the change folder notes
- [x] 6.2 Run `make check` and verify it passes; add a CHANGELOG.md entry under Unreleased describing the day start preference

## Workflow follow-up

- Update the ROADMAP.md row "Date, time and week-start preferences" to mention the day start.
- Archive with `/opsx:archive`, then confirm `npx --yes @fission-ai/openspec@1.14.3 validate --all --strict` passes.
