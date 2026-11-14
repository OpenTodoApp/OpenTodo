# Tasks

## 1. Web app

- [x] 1.1 `usePhoneListActions` (`web/src/app/task-list/ListChrome.tsx`): the duration filter and Upcoming's "Filter…" are always overflow items on a phone; no Filter button in the bar. Verify: `npx vitest run src/app/budget.test.tsx` ("a project's bar has no Filter button…": the menu lists the choices under "Filter by duration", choosing one filters the list).
- [x] 1.2 `PhoneDurationChip`: the active filter in the phone bar is one button with the filter icon and a ×, named "Clear filter", the filter's name before it for screen readers. Verify: the same test (the chip appears, the menu shows the choice checked, the chip clears the filter), `npx tsc --noEmit`, `npx eslint` on the changed files.
- [x] 1.3 The header from 768 px is untouched. Verify: `npx vitest run src/app/taskListView.test.tsx src/app/calendarFilter.test.tsx` (the Filter action and the named chip in the header).

## 2. Checks in a browser

- [x] 2.1 Built app, seeded account, Chromium at 360 px with touch: a project's and Upcoming's bar have no Filter button; "Unestimated" by tap and "Quick wins" by Enter, type-ahead, Enter filter the list from the project menu and leave focus on the menu's button; the chip clears the filter; Upcoming's "Filter…" opens the dialog and Escape returns focus to the menu's button. Verify: the measured title widths (a project 152 → 200 px, with a filter on 8 → 150 px; the Inbox with a filter on 0 → 40 px) and the before and after screenshots.
- [x] 2.2 At 1280 px the headers of the Inbox, a project, Today and Upcoming list the same controls as before, and the named chip keeps its size with a filter on. Verify: the same run.
- [ ] 2.3 On a phone, in the Android and the iOS app: the filter from a project's menu, the chip in the bar and its tap.

## 3. Docs and release

- [x] 3.1 `docs/built-in-views.md` (where the filter is on a phone) and `docs/interface-guide.md` (the phone bar). Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Changed/phone-bar-overflow.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [ ] 3.3 Re-baseline the phone-width UI screenshots of a project, Upcoming and Today.
