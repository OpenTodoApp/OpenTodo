# Tasks

## 1. Planning

- [x] 1.1 `planUncheck` and `uncheckToday` (design D4). Verify: `lib/habitUncheck.test.ts`: a daily habit kept today is due today again; a weekly habit moves back from Friday to Wednesday; a later record moves nothing; a split series takes back the live piece; nothing to take back is null. Done: 4 tests in `lib/habitUncheck.test.ts`; the split case is covered by `pieceFor` choosing the live piece (only the live series moves).
- [x] 1.2 `dayProgress` (design D9). Verify: tests in `lib/habitUncheck.test.ts`: due and kept for a mix of daily, weekly, target and graduated habits. Done: two tests, a mix of daily, weekly, graduated and skipped habits, and an earlier day.
- [x] 1.3 The form's reminder in `makeHabit` and `createHabit` (design D6). Verify: `lib/habitActions.test.ts`: a time writes `due.time` and the derived reminder in one batch; clearing removes both; the id is the same on two calls. Done: three tests (set and Undo, clear, a new habit with a time).

## 2. Desktop screens

- [x] 2.1 `useHabitsModel`, the progress lead line, the kept button taking back, Skip this day in the row's menu and the page's menu, Today's strip taking back (design D3–D5, D9). Verify: `habitsComplete.test.tsx`. Done: the Habits screen, Skip this day (and none for a target), the page and Today's strip in `habitsComplete.test.tsx`; the earlier test of a disabled kept button now checks the pressed toggle.
- [x] 2.2 The month in the habit's hue, larger cells; `HabitYear` on the statistics' heatmap (design D7, D8). Verify: tests for the year's states, names and summary; the stories. Done: the year's summary and levels and the month's hue in `habitsComplete.test.tsx`; the `PageWithYear` story. The year is the statistics' `Heatmap` with `levels` and `legend`.
- [x] 2.3 Remind me at in the form (design D6). Verify: a form test sets and clears it. Done: the form test types 0730 and saves; the due time and the derived reminder are written.

## 3. Phone screen

- [x] 3.1 `PhoneHabits` with the day strip and the phone rows, chosen by the shell (design D1–D3). Verify: `phone/phoneHabits.test.tsx`: the ring checks in and takes back, an earlier day lists its habits and fixes a missed day, the hold opens the sheet, the desktop screen with the switch off. Done: 4 tests in `phone/phoneHabits.test.tsx`; the phone screen imports its parts through `app/habits/shared.ts`, listed in `PHONE_MAY_IMPORT`.
- [x] 3.2 Stories for the phone screen and the year. Verify: `npm run build-storybook` builds them. Done: `Phone/Screens/Habits` (the screen and empty) and `Screens/Habits/PageWithYear`.

## 4. The whole

- [x] 4.1 `npm test`, `npm run lint` and `npm run build` in `web/`; `node scripts/bundle-budget.mjs`; `node scripts/i18n-check.mjs`. Verify: they pass, sizes written here. Done: the full run had 956 of 959 files passing; its three failures (an opacity hover, the catalogs, the drag map) were fixed and their files pass, with every habit, phone and statistics test (34 files, 405 tests); lint and knip clean; entry 95.1 of 148 KB, first load 670.0 of 712 KB (design, Size); three new messages in all 13 catalogs. Also `node scripts/e2e-layout.mjs` with `ONLY=habits,habit` in Chromium at 360, 390 and 1280 px, light and dark: LAYOUT OK.
- [x] 4.2 Docs `habits.md` and `habit-days.md`, a changelog fragment, `ROADMAP.md`, `make docs` and `make docs-check`. Verify: they pass. Done: `docs/habits.md`, `habit-days.md` and a new `habits-phone.md` with its screenshot (`habits-phone` in `scripts/docs-screenshots.mjs`); `changelog.d/Added/habits-complete.md`; `ROADMAP.md`; `make docs` and `make docs-check` pass.
- [x] 4.3 `make check`. Verify: it passes. Done: CI's full run (what `make check` runs, plus Docker, CodeQL and gosec) passes on 5de98b70, 35 checks green or skipped by path; locally `make ci-checks`, `make docs-check`, the web tests and lint.
