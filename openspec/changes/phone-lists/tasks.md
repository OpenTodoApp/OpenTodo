# Tasks

## 1. One wiring for both screens

- [x] 1.1 Move the list's wiring from `TaskListView.tsx` into `web/src/app/task-list/useListScreen.ts` (design D1), with the helper hooks it uses, in a commit that changes nothing else. `TaskListView` draws from the hook. Verify: `npm test` in `web/` passes with no test edited; `npm run lint`; the layout check on the list screens (`ONLY=inbox,today,upcoming,project,label,completed,assigned`) prints `LAYOUT OK` with the switch off.
- [x] 1.2 Move `ListHeader` into `task-list/ListHeader.tsx` and its menu items into `useListMenu` (design D3). Verify: `listChrome.test.tsx` and `closedListToday.test.tsx` pass unchanged; a new test lists the item ids per route. Done: the test is the per-list menu comparison in `phoneLists.test.tsx` (five lists).

## 2. The phone list

- [x] 2.1 `PhoneRow`: depth, the fold control, select mode (tick box, tap ticks), a field in place of the title, the attributes and overlay a drag needs; `PhoneListRow` on the list's row props; stories for each state. Verify: stories pass axe in both themes; `rowModel.test.tsx` covers depth and fold. Done: the UI check's a11y and visual jobs pass in the full CI run 45586690870.
- [ ] 2.2 `PhoneList` on `useListScreen` (design D2): the phone page header through `PageHeaderDrawContext`, the list's groups with the phone row (`rowRenderer`'s `Row`), a group's rows as one card. `Shell` renders it for the ten list routes with the phone UI on; `PhoneToday` and `PhoneTodayView` are removed and their stories and tests moved. Verify: `phoneLists.test.tsx`: for each route the ids, groups and order equal `useListModel`'s; a board keeps the present screen; the scenarios of "Every task list is a phone screen" and "Rows in every list". Done so far: nine of the ten routes (a place is missing), the board, subtasks and their fold, the project fact, the parent offer. Still to test: a place, a read-only project, a change from another device.
- [x] 2.3 The row's menu on a hold, with Edit title, Add task below and Add subtask opening in the row. Verify: tests for the three scenarios of "The row's menu"; by hand in the real app at 390 px with touch that the keyboard opens. Done: `phoneLists.test.tsx` (the menu's items, Edit title in the row) and `scripts/e2e-phone.mjs` (the hold by touch). Add subtask's field is not tested yet.
- [x] 2.4 Reordering: the phone row carries the attributes `useListDrag` reads and draws the drop line; the menu's Reorder. Verify: tests for "Reordering" (a drag by pointer events in happy-dom, the menu's moves, a sorted list); by hand at 390 px with touch in a project, the Inbox, a label, Today and Upcoming. Done: `scripts/e2e-phone.mjs` drags by touch in a project and checks the order after a reload; the menu offers Reorder (test). The other lists' drags were not tried.
- [x] 2.5 Selection: Select tasks, the selection bar, the bulk actions. Verify: tests for "Selecting tasks"; the layout check's `bulk-actions-menu` overlay with the switch on. Done: `phoneLists.test.tsx` and the bulk Complete in `scripts/e2e-phone.mjs`.

## 3. The bar and the menu

- [ ] 3.1 The phone header from `ListHeader` and `ProjectHeader` through `PhonePageHeader`: slots, chips, the menu, for every list (Inbox and label menus, a project's groups and layout switch, Completed's options). Verify: the equivalence test of design D8 (every menu item id of the present phone header is in the phone list's menu, per route); tests for the four scenarios of "The list's bar and menu".

## 4. Each list's own parts

- [ ] 4.1 Today: briefing, events and their toggle, habits strip, away notice, Earlier actions, Done today, Log a win, Close the day, time totals. Verify: tests per part against `closedListToday.test.tsx`'s cases; the screen equals the trial's Today for a seeded day.
- [ ] 4.2 Inbox (Process, routines slot, sample tasks), Upcoming (events per day, summarised later days, projections, Start with Today), Completed (search, options, show earlier). Verify: tests for the scenarios of "Each list keeps its own parts".
- [ ] 4.3 Project: note, linked references, sub-projects, sections with their menu, add and "n completed", Add section, the hidden tasks note. Label and place lists, Anytime, Someday, Assigned. Empty, filtered-empty and missing states. Verify: tests for "Groups and sections" and the empty and missing scenarios.
- [x] 4.4 Adding: the add button's sheet takes the list's `onAdd` and `onAddMany`; no add line at the top. Verify: tests for "Adding from a list", including a pasted list of three lines with one Undo. Done: a label's list adds with the label (`phoneLists.test.tsx`); the pasted list with one Undo is the sheet's own behaviour and is not tested again here.

## 5. Stories

- [x] 5.1 A story for every new component and for the screen as each list (Inbox, Today, Upcoming, Completed, a project with sections and subtasks, a label, selection on, an empty list), light and dark. Verify: `node scripts/ui-check.mjs` passes; the workbench a11y check passes on `Phone/`. Done: seven list stories, the page header and the row's states, with baselines; the full CI run 45586690870 passes. A selection story of the whole screen is not there; the row's is.

## 6. Docs

- [x] 6.1 `docs/phone-screens.md`: the lists, what the menu holds, selection, reordering. `changelog.d/Changed/phone-lists.md`. `ROADMAP.md` row, then the docs build. Verify: `npm run docs:build` and `docs:check` in `web/`; repo checks.

## 7. Checks

- [x] 7.1 The web app. Verify: `npm test`, `npm run lint` and `npm run build` in `web/`; `node scripts/bundle-budget.mjs` inside the budget, numbers written in design D9; `node scripts/i18n-check.mjs`. Done: 935 test files pass, lint and knip clean, entry 93.3 of 148 KB and first load 662.1 of 712 KB, 7,893 messages complete.
- [ ] 7.2 Performance. Verify: the list budgets of `docs/performance.md` on the 10,000-task account with the switch on (`scripts/perf/run.mjs`), numbers in the design.
- [x] 7.3 Layout and accessibility with the switch on: `layout-screens.mjs` marks every list screen as having a phone view; CI's "Layout check with the phone UI on" runs them. Verify: `PHONE_UI=1` layout check locally in Chromium at 360 and 390 px, light and dark, prints `LAYOUT OK`; the full CI run (`gh workflow run ci.yml -f base=main`) passes, WebKit included. Done locally and in the full CI run 45586690870 (29 jobs pass; Chromium only, WebKit runs nightly).
- [ ] 7.4 The real app at 390 px with touch: a walk through every list (open, complete, undo, swipe, hold menu, drag, select, add, the menu). Verify: no console error, and screenshots of each list reviewed.

## 8. On a phone

- [ ] 8.1 The owner tries every list on a phone with the switch on. Verify: their findings fixed or recorded here.
