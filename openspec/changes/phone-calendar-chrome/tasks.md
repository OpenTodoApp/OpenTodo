# Tasks

## 1. Web app

- [x] 1.1 `CalendarRangeSwitch` below 768 px (`DESKTOP_HEADER_QUERY`): one ghost menu button with the view's name and a chevron, at the end of the row, opening the five views as radio items; the group of five from 768 px. Verify: `npx vitest run src/app/calendarPhoneChrome.test.tsx` (the row's four controls and their names, the checked item, arrow keys, the date kept; the switch of five without a phone).
- [x] 1.2 `CalendarsToggle menu`: a checked item of the page's menu below 768 px, the button from 768 px; first in the overflow of Day, Week, Month, Plan and Year. Verify: the same test (the item in the bar's menu hides the event; no toggle in the row), `npx vitest run src/app/calendarEventsAllViews.test.tsx src/app/calendarView.test.tsx`.
- [x] 1.3 Type-check and lint. Verify: `npx tsc --noEmit`, `npx eslint` on the changed files, `node scripts/i18n-check.mjs` (no new string).

## 2. Checks in a browser

- [x] 2.1 Built app, the layout check's seed, Chromium with touch at 360 and 390 px: in Day, Week, Month, Plan and Year the content starts at y = 110 (160 before); the row's four controls share one line, each at least 44 × 44 px, none overlapping, nothing scrolling sideways. Verify: before and after measurements and screenshots.
- [x] 2.2 At 360 and 390 px, in each view: Previous, Today and Next by tap, by `[`, `]` and `t`, and by focus and Enter; every view from the menu by tap, and by Enter, ArrowDown, Enter; Escape returns focus to the view button. A project's Calendar layout shows one row with Calendar options at its end. Verify: the same run.
- [x] 2.3 At 768 and 1280 px every header control of the five views has the same place and size as before. Verify: the two measurements compared.
- [x] 2.4 The row in German and French at 360 px stays one row. Verify: the measurement with `OPENTODO_LANG=de` and `fr`.
- [x] 2.5 `scripts/e2e-layout.mjs` for day, week, month, plan, year and project-calendar, Chromium, 360, 390 and 768 px, light and dark. Verify: the run's report.
- [ ] 2.6 On a phone, in the Android and the iOS app: the calendar's row in each view, the view menu as a sheet, Today.

## 3. Docs and release

- [x] 3.1 `docs/calendar-views.md` (the row on a phone) and `docs/interface-guide.md` (the phone's calendar row). Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Changed/phone-calendar-chrome.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [ ] 3.3 Re-baseline the phone-width UI screenshots of Day, Week, Month, Plan, Year and a project's Calendar layout.
- [ ] 3.4 Add the change to `ROADMAP.md` under "Shells that feel native" and regenerate `docs/roadmap.md`.
