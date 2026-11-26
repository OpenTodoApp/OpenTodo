# Tasks

## 1. One row for the three lists

- [ ] 1.1 `WeekAgenda`'s task row drawn by `TaskRow shape="compact"` (design D1), with time, span place, deadline mark and estimate as props. Verify: `npx vitest run src/app/calendarView.test.tsx src/app/calendarSpans.test.tsx src/app/calendarDeadlines.test.tsx` passes with no assertion changed; the `Screens/Calendar` baselines unchanged or looked at and regenerated.
- [ ] 1.2 `MonthRow`'s list row the same way. Verify: `npx vitest run src/app/monthView.test.tsx`; the `Screens/Month` baselines.
- [ ] 1.3 `CalendarListContext` provided by `WeekAgenda`, `MonthDayList` and `PlanAgenda`; `TaskRow` hands the compact shape to `TaskRowDrawContext` inside it only (D2). Verify: a test that a board's card and a compact row outside a calendar list are not handed over; `npm run lint` (the import allow-list).

## 2. The phone row in the calendar

- [ ] 2.1 `PhoneTaskRow` draws the compact props: leading time or "all day", span place, estimate; a day's rows as one card (D2, D4). Verify: `phoneCalendar.test.tsx` for the scenarios "Open a task from Week", "A row keeps its calendar facts", "A read-only task"; stories `Phone/Screens/Calendar` (Week, Month's day, Plan) with baselines from `ui-baselines.yml`.
- [ ] 2.2 `useCalendarRowActions`: circle with `completeWithUndo`, swipe with `useRowSwipe` and `TaskDateSheet`, hold with `holdForRow` (D3). Verify: tests for "Complete from Month's day list", "Offline", "Move a task to Thursday", "Swipe to complete"; `undoCoverage.test.tsx` still passes.

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
