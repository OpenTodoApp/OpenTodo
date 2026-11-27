# Tasks

## 1. The seam

- [x] 1.1 `CalendarRowDrawContext` in `task-list/rowDraw.ts`; `WeekAgenda`, `MonthRow` (the chosen day's list) and `PlanDayRows` (the agenda) call it when it is set and draw their own row otherwise (design D1). Verify: `npx vitest run src/app/calendarView.test.tsx src/app/monthView.test.tsx src/app/planView.test.tsx src/app/calendarSpans.test.tsx src/app/calendarDeadlines.test.tsx src/app/calendarPhoneChrome.test.tsx` passes with no assertion changed (186 with `src/phone`); `npm run lint` (the import allow-list).

## 2. The phone row in the calendar

- [x] 2.1 `PhoneCalendarRow` with the calendar's facts, provided by `PhoneChrome`; a day's tasks as one card (D2, D4). Verify: in a real browser at 390 px with touch on a seeded server, Week, Month's day and Plan list phone rows and none of the earlier rows, nothing scrolls sideways, no console error; a tap opens the task page and Back returns to Week; the circle completes and Undo is offered (done 2026-11-26, screenshots looked at).
- [x] 2.2 `phoneCalendar.test.tsx`: seven tests for the scenarios of "A task in a calendar list is the phone row" and "Swipes and the date sheet in a calendar list" (Week, Month's day, Plan, a read-only task, the switch off and 768 px, both swipes with the real gesture, a day picked in the date sheet). Verify: the file three times in a row (7 pass); `npx vitest run src/phone src/app/calendarView.test.tsx src/app/monthView.test.tsx src/app/planView.test.tsx` (167 pass). Not asserted: Month's count in the grid after a completion.
- [x] 2.3 The story `Phone/Screens/Calendar row` with baselines from `ui-baselines.yml` (run 45818483830). Verify: the four images looked at (the facts in order, the deadline in the accent tone, a past day's "all day" in the danger tone); no other story of the calendar changed.

## 3. Touch in the grid

- [x] 3.1 `resizeZone(blockHeight, pointerType)` in `calendar/grid.ts`, used by `DayColumn`, `SlotBlock` and `EventBlock` (D5). Verify: `npx vitest run src/app/calendar/grid.test.ts src/app/calendarResizeStart.test.tsx src/app/slots.test.tsx src/app/calendar/eventEdits.test.tsx` (15 pass; the existing ones unchanged).

## 4. Checks

- [x] 4.1 `scripts/e2e-phone.mjs`: in Week a tap opens the task page and Back returns, a swipe to the start edge opens the date sheet; under Month the circle completes and Undo is offered; no row of the earlier kind in either. Verify: the script passes against a build of this branch (done 2026-11-26). Not in the script: a resize by touch in Day (covered by the unit tests of the zone only).
- [x] 4.2 Layout and accessibility: `node scripts/e2e-layout.mjs` in Chromium and in WebKit (the pinned image) at 360 and 390 px, and `A11Y_ONLY=1 node scripts/ux-audit/tour.mjs` at 360 px, for day, week, month, plan. Verify: `LAYOUT OK`, 0 findings. Done: the full CI run with every leg on main after the phone changes (run 45845169175, 2026-11-26: the layout check in Chromium at three widths, in WebKit at 360, 390 and 768 px, in German and French, the safe-area leg, the end-to-end scripts with `e2e-phone`, both accessibility legs; 41 jobs pass), and again on the commit released as 1.10.1 (run 45889260718).
- [x] 4.3 `npm test` and `npm run build` in `web/`, `make bundle-budget`, `make ui-check`, `make docs` and `make docs-check`, `openspec validate --all --strict`. Verify: all pass; the first-load number in the pull request. Done before the merge (#2110): 954 files, 11,010 tests; first load 668.4 of 712 KB; `ui-check`, docs build and check, repo checks, `openspec validate`.
- [ ] 4.4 Right to left: the three stories with `direction: 'rtl'`. Verify: baselines looked at; the leading time sits at the start edge.

## 5. Docs and release notes

- [x] 5.1 `docs/phone-screens.md` says what the calendar does on a phone (under 600 words in all); `changelog.d/Changed/phone-calendar.md`. Verify: `make docs-check`. Done: the page's section "The calendar" (the page stays under 600 words) and the fragment, released in 1.10.1.

## 6. Trial

- [ ] 6.1 The owner tries Week, Month and Day on a phone. Verify: their findings fixed or recorded here.
