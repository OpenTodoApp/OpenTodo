# Tasks

## 1. Lists

- [x] 1.1 The day closes (design D1): `TodayGlance.tsx` (ring transition), the Today empty state on a phone, the success haptic on the last completion. Verify: `phoneDelight.test.tsx`: "All done for today" with the count, the empty-day state without completions, the haptic once on the last completion and not on opening an empty Today.
- [x] 1.2 Pull to sync (design D3): `phone/usePullToSync.ts`, its line in `PhoneList.tsx`. Verify: `phoneDelight.test.tsx`: a pull past the threshold calls `syncNow` once and shows the states; a short pull does not.
- [x] 1.3 Empty lists centred (design D8). Verify: screenshot of an empty Inbox at 390 px, looked at; the layout check passes.
- [x] 1.4 The header follows the screen (design D9): `.phone-glow` variables, the project colour, the progress in Today's bar. Verify: `phoneDelight.test.tsx`: the project's colour on the light; the bar's ring and count on Today.

## 2. Gestures

- [x] 2.1 The task grows into its page (design D2): `phone/transition.ts`, `index.css`. Verify: `transition.test.ts`: the row's title is named before the push and cleared after; on a pop the row is named after the list returns; one name per capture.
- [x] 2.2 A hold shows the task (design D4): `BulkActionsMenu` head, the phone list. Verify: `phoneDelight.test.tsx`: the sheet for one task shows its title and facts and is named by it; two tasks keep the count.
- [x] 2.3 Drop on a day (design D5): `WeekStrip.tsx`. Verify: `phoneDelight.test.tsx`: every day carries its drop key, empty days too; `dropUndoable('day:…')` covered by its own tests.

## 3. Quick add and tabs

- [x] 3.1 Dates in one tap (design D6): `SheetBar.tsx`, `QuickAdd.tsx`. Verify: `quickAddSheet.test.tsx`: the chips show without a date, a tap writes the date, they go with a date.
- [x] 3.2 Counts and holds on the tabs (design D7): `TabBar.tsx`, `useTabCounts`. Verify: `tabBar.test.tsx`: counts and names, hidden at zero; hold on Today opens the next timed task, hold on Inbox opens the Inbox with quick add; a tap navigates.

## 4. Checks and docs

- [x] 4.1 Strings in every catalogue, `messages.json` regenerated. Verify: `node scripts/i18n-check.mjs`.
- [ ] 4.2 Stories for the new states, baselines regenerated, full CI on the branch (layout, e2e, a11y, visual). Verify: the full CI run passes every leg.
- [x] 4.3 `docs/phone-screens.md`, `changelog.d/Added/phone-delight.md`, docs build. Verify: `make docs-check`.
- [ ] 4.4 Screenshots of each item at 390 px in both themes, sent to the owner.
