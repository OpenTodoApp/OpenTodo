## 1. Capacity logic

- [ ] 1.1 `web/src/lib/calendar.ts`: `GridPrefs.countEvents` (default `false`) in `DEFAULT_GRID_PREFS` and `normalizeGridPrefs`; unit test: missing and non-boolean values read as `false`
- [ ] 1.2 Share `eventMinutes` between `plan.ts` and `calendar.ts` without an import cycle; `plan.test.ts` still passes unchanged
- [ ] 1.3 `dayLoad(tasks, date, dayLength, eventMinutes?)` returns task minutes, event minutes, `overTasks` and `overWithEvents`; `calendar.test.ts` covers at rest, over by tasks, over only with meetings, free and all-day events ignored, overlap counted once, the midnight split

## 2. Views

- [ ] 2.1 `CapacityLine`: the warning tone and "Over with meetings", the state in the accessible name; story states for rest, over and over with meetings in light and dark; `make ui-lint`
- [ ] 2.2 `calendar/DayColumn.tsx`: pass event minutes when `countEvents` is on and the Calendars toggle shows events; tooltip "4h 15m of tasks, 2h 30m in meetings · n tasks without estimate" and the offline-outside-cache wording; happy-dom test `meetingCapacity.test.tsx`
- [ ] 2.3 `MonthView.tsx`: the same sum, the line shown on meeting-only days, the warning tone; cases in `meetingCapacity.test.tsx`; phone layout unchanged (`make layout-check` at 360 px)
- [ ] 2.4 `CalendarSettings.tsx` and `settingsCopy.ts`: the "Count meetings in capacity" row, shown only while a subscription is known; `settingsCopy.test.ts` limits pass; a test that the row is hidden without subscriptions and that toggling writes device meta only (no op)

## 3. Docs, strings, checks

- [ ] 3.1 Strings in the six catalogs; `make i18n-check`
- [ ] 3.2 `docs/time-blocking.md` (capacity), `docs/other-calendars.md` (meetings and capacity), the Settings › Calendar guide; `make docs-check`
- [ ] 3.3 CHANGELOG Unreleased "Added"
- [ ] 3.4 `cd web && npm test && npm run build`; `make openspec-validate`
