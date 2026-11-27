# Tasks

## 1. Numbers

- [x] 1.1 `weekProgress`, `weekdayRates` and `recentKept` in `lib/habitDay.ts` (design D3, D4). Verify: `lib/habitDay.test.ts`: sums over daily, weekly and target habits; a weekday without due days. Done: `lib/habitDay.test.ts`.

## 2. The Habits screen

- [x] 2.1 `HabitsOverview` and `HabitBoard`, the wide page, the board from 640 px (design D1 to D3). Verify: `habitBoard.test.tsx`: the tiles, today's mark checks in and takes back, yesterday's mark sets and clears without moving the habit, a day off is not a control, an amount opens Set amount, the rows below 640 px. Done: `habitBoard.test.tsx` (the tiles, today, yesterday set and cleared, a day off, an amount, the rows at 600 px); the row-layout tests of `habitsScreen`, `habitNotes` and `habitTargets` now say they read the rows below 640 px. The board's columns are compact under a 44 rem container (a tablet with the sidebar).

## 3. The habit's page

- [x] 3.1 The tiles, the two-column grid, `WeekdayChart`, the cards (design D4). Verify: tests for the tiles and the chart's list; the existing page tests pass. Done: the page test in `habitBoard.test.tsx`; the earlier page tests pass.

## 4. The whole

- [ ] 4.1 Stories; `npm test`, `npm run lint`, `npm run build`, the bundle budget, catalogues; the layout check on the habit screens. Verify: they pass.
- [x] 4.2 Docs, changelog, `make docs`, `make docs-check`; screenshots refreshed. Verify: they pass. Done: `habits.md`, `habit-targets.md`, `changelog.d/Added/habits-board.md`, `ROADMAP.md`; the habits, habit-page, habit-targets and habits-phone screenshots regenerated; `make docs` and `make docs-check` pass.
