# Tasks

## 1. The tab bar

- [x] 1.1 The floating bar and the add button beside it (design D1): `phoneFrame.tsx` (`TAB_BAR_FRAME`, `tabBarFrame`), `TabBar.tsx` (the pill, the measured room, the button's place), `Shell.tsx` (the room in the scroller), `useScrollDirection.ts` (the toast's lift), `index.css` (`--add-room`). Verify: `tabBar.test.tsx`, `phoneFrame.test.tsx`, `budget.test.tsx` updated and passing.
- [x] 1.2 The layout check and the end-to-end phone script with the floating bar. Verify: the full CI run on this branch passes its layout legs (Chromium, WebKit, French, German, safe area) and the end-to-end leg. Done: run 46072671476, every leg; the two runs before it found the week's day names, the selection bar under the floating bar and a reminder over its Actions, all fixed.

## 2. Widgets

- [x] 2.1 Today at a glance (design D2): `TodayGlance.tsx`, in `PhoneList.tsx` for Today. Verify: `phoneModern.test.tsx`: the counts, Up next and its fallback, no tiles on an empty day, Up next opens the task, Late scrolls.
- [x] 2.2 Upcoming's week (design D2): `WeekStrip.tsx`, in `PhoneList.tsx` for Upcoming. Verify: `phoneModern.test.tsx`: seven days from tomorrow, dots up to three, only a day with tasks can be chosen.
- [x] 2.3 "Up next" and "Next seven days" in every catalogue. Verify: `node scripts/i18n-check.mjs`.

## 3. The look

- [x] 3.1 The light, the clear-then-frosted header and the phone card radius (design D3): `index.css`, `PhoneList.tsx`, `PhoneHeader.tsx`, `FactRow.tsx`, `PhoneDateSheet.tsx`. Verify: screenshots of Today, Upcoming and the task page at 390 px in both themes, looked at.
- [x] 3.2 The task page's fields as tiles (design D4): `FactChips` in `FactRow.tsx`. Verify: the phone task page tests pass unchanged.
- [x] 3.3 Stories for the two widgets and the regenerated baselines of every phone story. Verify: the visual job passes on them; the a11y check of the stories passes. Done: run 46072671476 and the merge queue of #2179.

## 4. Docs

- [x] 4.1 `docs/phone-screens.md`, `changelog.d/Changed/phone-modern-look.md`, docs build. Verify: `npm run docs:build` and `docs:check`; repo checks.
