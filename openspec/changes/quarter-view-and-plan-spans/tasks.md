# Tasks

## 1. Quarter mode wiring

- [ ] 1.1 Add `'quarter'` to `CalendarMode`/`readEnum` in `web/src/lib/calendarMode.ts`, to the `Route` union, `VIEW_QUICK_ADD`, `parseRoute` and `routePath` in `web/src/app/router.ts` (`/quarter[/YYYY-MM-DD]`), and insert it between Month and Plan in `CalendarRange.tsx`'s `MODES`. Verify `npm test -- router.test naming.test calendarView.test` and `npm run typecheck`.
- [ ] 1.2 Add `quarter: 'calendar'` to `ROUTE_SCREENS` (`web/src/app/screens.ts`) and include `quarter` in the calendar-page checks in `panel.ts`, `ShortcutHelp.tsx` and `Sidebar.tsx`. Verify `npm test -- screens.test sidebar.test shortcutHelp.test` (a missing `ROUTE_SCREENS` entry fails `screens.test.ts`).
- [ ] 1.3 Lazily render `QuarterView` from `Shell.tsx` and `ProjectCalendar.tsx`; add `go.quarter` to `Shell.tsx`'s global handler table. Verify `npm run typecheck` and `npm test -- calendarView.test projectCalendar.test`.

## 2. Quarter view and keyboard

- [ ] 2.1 Extract Year's `MonthCells`, step constants and `tipText` into `web/src/app/calendar/MonthDensityCells.tsx`, import it back into `YearView.tsx`, and add `quarterOf()` (first month, three month keys, `from`/`to`, `Q<n> <year>`) in `web/src/lib/quarter.ts`. Verify `npm test -- yearView.test quarter.test` and `npm run typecheck`.
- [ ] 2.2 `web/src/app/QuarterView.tsx`: density counts and calendar events over the quarter's `[from, to]`, three month grids, day → Day, month name → Month, tooltip, phone fallback, `rememberCalendarMode('quarter')`, `data-calendar-page="quarter"`, `CalendarRangeSwitch mode="quarter"` and `[`/`]` stepping three months. Verify a new `quarterView.test.tsx`: quarter boundaries for a November anchor, three months drawn, a task's density mark, offline rendering.
- [ ] 2.3 Register `go.quarter` (`g q`), the `quarter.*` view entries, `VIEW_SCOPES.quarter`, the `SPOTLIGHT_GROUPS` entry and the palette command; update `SHORTCUT_SECTIONS`' calendar title. Verify `npm test -- shortcuts.test palette.test` (the conflict check and "every view entry names a view in VIEW_SCOPES").

## 3. Plan spans

- [ ] 3.1 Widen `PlanSpan` to `number`, `PLAN_SPANS` to `[3, 7, 14, 21]` and add `MIN/MAX_PLAN_DAYS = 1/90` with `validPlanDays()` in `web/src/lib/calendar.ts` (re-exported by `web/src/lib/plan.ts`); widen `GridPrefs.planDays` and `normalizeGridPrefs()` in `web/src/lib/calendar.ts` to any integer in range, default 14. Verify `npm test -- plan.test calendar.test` with cases for 3, 10, 90, 91, 0, a string, a missing value and the old 21.
- [ ] 3.2 Add the `3 days` preset and a `Custom…` menu item to Plan's overflow menu; `Custom…` opens a labelled numeric dialog (1–90, Save/Cancel), refuses invalid input, and saves through `saveGridPrefs`. Mark the custom item checked with its current length when the span is not a preset. Verify a new `planView.test.tsx` case: choose `3 days`, choose `Custom…` with 10, reload and read `calendar.grid` back, and reject 91.

## 4. Documentation and release

- [ ] 4.1 Refresh `web/src/locales/messages.json` with `node scripts/i18n/extract.mjs --write`, add the new messages (`Previous quarter`, the range error) to all six catalogs; verify `make i18n-check`.
- [ ] 4.2 Document Quarter in `docs/calendar-views.md` and `docs/months-and-year.md` (reusing the `calendar` screen id), then run `make docs` so `docs/keyboard.md` and `docs/roadmap.md` are current; verify `make docs-check`.
- [ ] 4.3 Add `changelog.d/Added/quarter-view-and-plan-spans.md`; verify `make docs-check`.
- [ ] 4.4 `cd web && npm test && npm run build`, `make openspec-validate`, `make bundle-budget`, `make check` with TZ=UTC; verify all pass.
