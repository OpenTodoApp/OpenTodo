# Tasks

## 1. The seam

- [x] 1.1 `CalendarRowDrawContext` in `task-list/rowDraw.ts`; `WeekAgenda`, `MonthRow` (the chosen day's list) and `PlanDayRows` (the agenda) call it when it is set and draw their own row otherwise (design D1). Verify: `npx vitest run src/app/calendarView.test.tsx src/app/monthView.test.tsx src/app/planView.test.tsx src/app/calendarSpans.test.tsx src/app/calendarDeadlines.test.tsx src/app/calendarPhoneChrome.test.tsx` passes with no assertion changed (186 with `src/phone`); `npm run lint` (the import allow-list).

## 2. The phone row in the calendar

- [x] 2.1 `PhoneCalendarRow` with the calendar's facts, provided by `PhoneChrome`; a day's tasks as one card (D2, D4). Verify: in a real browser at 390 px with touch on a seeded server, Week, Month's day and Plan list phone rows and none of the earlier rows, nothing scrolls sideways, no console error; a tap opens the task page and Back returns to Week; the circle completes and Undo is offered (done 2026-11-26, screenshots looked at).
- [ ] 2.2 Tests in `phoneCalendar.test.tsx` for the scenarios of "A task in a calendar list is the phone row" and "Swipes and the date sheet in a calendar list"; stories `Phone/Screens/Calendar` (Week, Month's day, Plan) with baselines from `ui-baselines.yml`. Verify: the tests pass three times in a row; `undoCoverage.test.tsx` still passes.

## 3. Touch in the grid and Week

- [ ] 3.1 The resize zone on a coarse pointer (D5) as a pure function in `calendar/grid.ts`, used by `DayColumn`. Verify: unit tests for a 30-minute, a 15-minute and a 2-hour block, coarse and fine; `calendarResizeStart.test.tsx` unchanged.
- [ ] 3.2 Tap to place in Week below 640 px (D6). Verify: tests for "Place on Friday" and "Cancel"; `calendarPlanPanel.test.tsx` unchanged.

## 4. Checks

- [ ] 4.1 `scripts/e2e-phone.mjs`: Week opens a task and returns, a swipe in Week opens the date sheet, Month's day list completes, a block lengthens by touch in Day, scrolling over a block moves nothing. Verify: `scripts/e2e.sh` passes.
- [ ] 4.2 Layout and accessibility: `node scripts/e2e-layout.mjs` in Chromium and in WebKit (the pinned image) at 360 and 390 px, and `A11Y_ONLY=1 node scripts/ux-audit/tour.mjs` at 360 px, for day, week, month, plan. Verify: `LAYOUT OK`, 0 findings.
- [ ] 4.3 `npm test` and `npm run build` in `web/`, `make bundle-budget`, `make ui-check`, `make docs` and `make docs-check`, `openspec validate --all --strict`. Verify: all pass; the first-load number in the pull request.
- [ ] 4.4 Right to left: the three stories with `direction: 'rtl'`. Verify: baselines looked at; the leading time sits at the start edge.

## 5. Docs and release notes

- [ ] 5.1 `docs/phone-screens.md` says what the calendar does on a phone (under 600 words in all); `changelog.d/Changed/phone-calendar.md`. Verify: `make docs-check`.

## 6. Trial

- [ ] 6.1 The owner tries Week, Month and Day on a phone. Verify: their findings fixed or recorded here.
