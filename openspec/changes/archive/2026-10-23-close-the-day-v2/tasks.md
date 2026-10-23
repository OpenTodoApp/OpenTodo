## 1. The day closed (D1)

- [x] 1.1 Add `closed_day` (string) to `Schema["review"]` in `internal/sync/ops.go`, `web/src/lib/types.ts` (`Review`), `REVIEW_DEFAULTS` in `web/src/lib/ops.ts` and the shared fixture `internal/sync/testdata/schema_fixture.json`; verify `go test ./internal/sync/...` and `npm test -- schemaFixture entityTables`
  - Done: `closed_day` in the Go schema, `Review`, `REVIEW_DEFAULTS` and the shared fixture; `go test ./internal/sync/` passes.
- [x] 1.2 In `web/src/lib/review.ts` add `closedDayOf(review)` (`closed_day` when set, else the logical day of `closed_at`) and route `dayClosed`, `yesterdaysNote` and `canReopenDay` through it; `closeDay(note, day, now)` writes `closed_at`, `closed_day` and `tomorrow_note`; `reopenDay` clears `closed_day`; update the callers (`CloseDayRow.tsx`, `Sidebar.tsx`, `method/LoopHome.tsx`, `CloseDay.tsx`); verify `npm test -- review` with cases for a close stored with and without `closed_day`
  - Done: `closedDayOf` (a non-date value also falls back to the stamp), the callers updated; `review.test.ts` covers a close with and without `closed_day`.
- [x] 1.3 Capture the logical today once when Close the day opens and build the summary, the carry-over plan and the close from it; verify a vitest that opens the screen at 23:59, moves the clock past midnight, and finds Wednesday's figures, the tasks due Thursday, `closed_day` = Wednesday, and Thursday's Daily check showing the note ("Closing across midnight", "Closed just after midnight")
  - Done: `useClosingDay` keeps the first logical today; `closeDay.test.tsx` "Closing across midnight" fakes the minute tick from 23:59 to 00:02 and checks the figures, the dues, `closed_day` and Thursday's Daily check.

## 2. Carry over (D2, D3)

- [x] 2.1 `planCarryOver` and `applyCarryOver` gain the `done` decision (planned as the bulk complete: series roll, subtrees complete) and take all tasks for it; `applyCarryOver` joins a same-day `carry_over` record; verify `npm test -- review` (Done already, a repeating task rolling, two batches in one record and Reopen restoring both)
  - Done: `done` plans as `planComplete`; `joinItems` keeps the first value before and the latest after; lib tests "Done already" and "Two batches in one evening".
- [x] 2.2 Register `close.done` (`d`, view scope `review`) in `web/src/lib/shortcuts.ts` without a conflict; verify `npm test -- shortcuts`
  - Done: `close.done` overrides `vim.delete` on this screen, as `triage.relative` overrides `vim.priority` (Carry over has no list rows for `d d`); the shortcut tests pass.
- [x] 2.3 Rewrite the Carry over step as one card per task with the five decisions and their keys, auto-advance, the decisions list below (lines bring a task back), Keep only with its reason for read-only tasks, and no completing checkbox; verify `npm test -- closeDay` (Default carry-over, Mixed decisions, Read-only task, Nothing to carry over, Done already, Change an earlier decision, No accidental completion)
  - Done: `CarryOver.tsx` (`CarryCard`, `CarryList`); the list lines carry the whole title as their accessible name and in a tooltip.
- [x] 2.4 Write the batch when moving on from Carry over (Next, `]`, a later circle); drop Apply and the Applied badge; the stepper shows Carry over done once past it; verify `npm test -- closeDay` ("Past Carry over", the toast and one Undo)
  - Done: `go()` applies when leaving Carry over forward; the batch's "kept" count is taken when it is written, so Done for today does not depend on the live list catching up.

## 3. Note and layout (D4, D5)

- [x] 3.1 Rename the third step "A note for tomorrow morning" with the field "Note (optional)" and the live preview; verify `npm test -- closeDay` ("Note preview")
  - Done: field "Note (optional)", description and the live preview.
- [x] 3.2 `StepCard` gains `navInside` (Back and Next in the card's footer); Close the day uses it; How the day went becomes one sentence with emphasised numbers plus the focus sentence; verify `npm test -- closeDay` (figures still 8, 5, "2 of 3") and the review stories in both themes at 375 and 1280 px (`make ui-check` visual baselines regenerated in the pinned image)
  - Done: `StepCard navInside`, used by Close the day only (weekly review unchanged, open question 1); new story "Close the day · how it went"; baselines regenerated in the pinned image.
- [x] 3.3 Strings in the five translated catalogs and `messages.json`; verify `make i18n-check`
  - Done: 22 strings in the five catalogs, 13 unused removed; `make i18n-check` passes.

## 4. Docs and checks

- [x] 4.1 Update `docs/method/rhythms.md` (the one-at-a-time carry-over, moving on applies, Done already, the note's preview, the day fixed on opening), regenerate `docs/keyboard.md`, add the CHANGELOG entry under Unreleased; verify `make docs-check`
  - Done: `docs/method/rhythms.md`, `docs/keyboard.md` (generated), CHANGELOG under Unreleased → Fixed; `make docs-check` passes.
- [x] 4.2 Run `make check` with `TZ=UTC`, `go test ./...`, `npm test` and `npm run build` in web/; open the pull request and get CI green
