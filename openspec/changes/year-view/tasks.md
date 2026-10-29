# Tasks: year-view

## 1. Several months in Month
- [ ] 1.1 Add the per-device "Months shown" preference (1, 2, 3, 6; key `ot.calendar.months`, default 1) beside the calendar mode in `web/src/lib/calendarMode.ts`, with try/catch storage like the existing keys; verify with a unit test for the default, each value and a blocked storage (`npm test`).
- [ ] 1.2 Render stacked month grids in `web/src/app/MonthView.tsx` with month headings, empty outside days and the range title; add the menu item to Month's page menu; verify with `web/src/app/monthView.test.tsx` cases from "Three months on this device".
- [ ] 1.3 Extend the Month keyboard grid across stacked months (`useCalendarKeys.ts`): arrows, `j`/`k`, `[`/`]` by one month, `t`; verify with keyboard tests "Across stacked months" and "Step one month".
- [ ] 1.4 Show one month below 640 px whatever the preference; verify with a 390 px test and the layout check at 360 px.

## 2. Year mode
- [ ] 2.1 Add `year` to `CalendarMode`, the router (`{ view: 'year', date }`), `CalendarRangeSwitch` and the sidebar's last-mode opening; register `g y` in `web/src/lib/shortcuts.ts`; verify with router and registry conflict tests (`npm test`).
- [ ] 2.2 Write the pure counter `yearCounts(tasks, projectionsSource, spans, year, zone, dayLength)` in `web/src/lib/yearView.ts` returning count, minutes and up to three titles per day (D4, D7); verify with unit tests for the "Steps", "Recurring and spanning tasks count" and "Events do not count" scenarios.
- [ ] 2.3 Build `YearView` (compact grids 4×3 / 3×4 / 2 columns, density steps from the chart tokens, over-capacity dot, today and past tones, month-name links, Tooltip with count and titles); verify with a happy-dom test and `npm run build`.
- [ ] 2.4 Implement the Year keyboard grid (one tab stop, arrows, Page Up/Down, Home/End, `[`/`]`, `t`, Enter, Escape) and accessible day names; verify with keyboard tests from "Navigating from the year" and the accessibility gate (`make ui-check`).
- [ ] 2.5 Phone layout: two columns below 768 px, a month as the touch target below 640 px; verify with a 390 px test and the layout check at 360 px in German and French.
- [ ] 2.6 Add a perf test at 10,000 open tasks and 50 daily series asserting the 100 ms render budget (D7); verify with `npm test`.
- [ ] 2.7 Add Year and three-month Month stories (light, dark, 375 and 1280 px) and mark Year in the screen inventory; verify with `make ui-check` and `make ui-lint`.

## 3. Docs, copy and release
- [ ] 3.1 Document "Several months" and "The year" in `docs/calendar-views.md` and the new keys in the keyboard docs; verify the docs check passes (`make check`).
- [ ] 3.2 Translate the new strings (Year, Months shown, range titles, "{n} tasks", "over capacity", shortcut descriptions) in `messages.json`, `de`, `es`, `fr`, `it` and `pt`; verify with the locale completeness test (`npm test`).
- [ ] 3.3 Run `make check` and `cd web && npm test && npm run build`; add the CHANGELOG entry under Unreleased when archiving.
