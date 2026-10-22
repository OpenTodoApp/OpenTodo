## 1. The day closed (D1)

- [ ] 1.1 Add `closed_day` (string) to `Schema["review"]` in `internal/sync/ops.go`, `web/src/lib/types.ts` (`Review`), `REVIEW_DEFAULTS` in `web/src/lib/ops.ts` and the shared fixture `internal/sync/testdata/schema_fixture.json`; verify `go test ./internal/sync/...` and `npm test -- schemaFixture entityTables`
- [ ] 1.2 In `web/src/lib/review.ts` add `closedDayOf(review)` (`closed_day` when set, else the logical day of `closed_at`) and route `dayClosed`, `yesterdaysNote` and `canReopenDay` through it; `closeDay(note, day, now)` writes `closed_at`, `closed_day` and `tomorrow_note`; `reopenDay` clears `closed_day`; update the callers (`CloseDayRow.tsx`, `Sidebar.tsx`, `method/LoopHome.tsx`, `CloseDay.tsx`); verify `npm test -- review` with cases for a close stored with and without `closed_day`
- [ ] 1.3 Capture the logical today once when Close the day opens and build the summary, the carry-over plan and the close from it; verify a vitest that opens the screen at 23:59, moves the clock past midnight, and finds Wednesday's figures, the tasks due Thursday, `closed_day` = Wednesday, and Thursday's Daily check showing the note ("Closing across midnight", "Closed just after midnight")

## 2. Carry over (D2, D3)

- [ ] 2.1 `planCarryOver` and `applyCarryOver` gain the `done` decision (planned as the bulk complete: series roll, subtrees complete) and take all tasks for it; `applyCarryOver` joins a same-day `carry_over` record; verify `npm test -- review` (Done already, a repeating task rolling, two batches in one record and Reopen restoring both)
- [ ] 2.2 Register `close.done` (`d`, view scope `review`) in `web/src/lib/shortcuts.ts` without a conflict; verify `npm test -- shortcuts`
- [ ] 2.3 Rewrite the Carry over step as one card per task with the five decisions and their keys, auto-advance, the decisions list below (lines bring a task back), Keep only with its reason for read-only tasks, and no completing checkbox; verify `npm test -- closeDay` (Default carry-over, Mixed decisions, Read-only task, Nothing to carry over, Done already, Change an earlier decision, No accidental completion)
- [ ] 2.4 Write the batch when moving on from Carry over (Next, `]`, a later circle); drop Apply and the Applied badge; the stepper shows Carry over done once past it; verify `npm test -- closeDay` ("Past Carry over", the toast and one Undo)

## 3. Note and layout (D4, D5)

- [ ] 3.1 Rename the third step "A note for tomorrow morning" with the field "Note (optional)" and the live preview; verify `npm test -- closeDay` ("Note preview")
- [ ] 3.2 `StepCard` gains `navInside` (Back and Next in the card's footer); Close the day uses it; How the day went becomes one sentence with emphasised numbers plus the focus sentence; verify `npm test -- closeDay` (figures still 8, 5, "2 of 3") and the review stories in both themes at 375 and 1280 px (`make ui-check` visual baselines regenerated in the pinned image)
- [ ] 3.3 Strings in the five translated catalogs and `messages.json`; verify `make i18n-check`

## 4. Docs and checks

- [ ] 4.1 Update `docs/method/rhythms.md` (the one-at-a-time carry-over, moving on applies, Done already, the note's preview, the day fixed on opening), regenerate `docs/keyboard.md`, add the CHANGELOG entry under Unreleased; verify `make docs-check`
- [ ] 4.2 Run `make check` with `TZ=UTC`, `go test ./...`, `npm test` and `npm run build` in web/; open the pull request and get CI green
