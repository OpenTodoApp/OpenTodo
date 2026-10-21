# Tasks

## 1. Op schema and content fields

- [x] 1.1 Add `closed_at` (number) and `tomorrow_note` (string) to `Schema["review"]` in `internal/sync/ops.go` with a comment naming this change, and `"review": {"tomorrow_note"}` to `ContentFields` in `internal/e2ee`; extend `internal/e2ee/fields_test.go` so `IsContentField("review", "tomorrow_note")` is true and `IsContentField("review", "closed_at")` is false; verify `go test ./internal/sync/... ./internal/e2ee/...` passes
- [x] 1.2 Update `internal/sync/testdata/schema_fixture.json` with the two fields and the content entry, and mirror them in `web/src/lib/types.ts` (`Review`), `web/src/lib/ops.ts` (`REVIEW_DEFAULTS`: `closed_at: 0, tomorrow_note: ''`) and `web/src/lib/e2ee.ts` (`CONTENT_FIELDS.review`); verify `go test ./internal/sync/...` and `cd web && npm test -- schemaFixture e2ee` both pass, proving both sides agree
- [x] 1.3 Add a test in `web/src/lib/e2ee.test.ts` (or `e2eeSync` tests) that an encrypted account's `review` op for `tomorrow_note` leaves the device as an envelope while `closed_at` stays plaintext (spec "Line for tomorrow is ciphertext, the close time is not"); verify `npm test -- e2ee` passes
- [x] 1.4 Document the field in `docs/e2ee.md` (the content-field list) and `docs/sync-protocol.md` or wherever the `review` entity's fields are listed; verify `make docs-check` passes

## 2. Pure logic in the data layer

- [x] 2.1 Add to `web/src/lib/review.ts`: `CLOSE_STEP_IDS`, `CLOSE_STEP_TITLES`, `dayClosed(closedAt, today)`, `yesterdaysNote(review, today)`, `closeDay(note, now)` (one `mutate` on `review`/`me`) with doc comments naming the spec requirements; verify new cases in `web/src/lib/review.test.ts` (closed today vs yesterday vs never; note shown only for an earlier day; empty note is null; the op patch holds both fields) pass with `npm test -- review`
- [x] 2.2 Add `daySummary(input, review, now, weekStart)` returning `planned`, `done`, `focusDone`, `focusTotal`, `unfinished` with `done` taken from `compute()`'s `perDay` for today and `unfinished` from `todayList` minus archived projects and read-only tasks; verify tests for the "A day with a focus" (8 planned, 5 done, focus 2 of 3), "Nothing was planned", deleted task and skipped habit occurrence cases pass, and a test that `done` equals `compute(periodFor('this-week'))`.perDay for today, with `npm test -- review`
- [x] 2.3 Add `planCarryOver(decisions, tasks, today): Change[]` using `planDue` for Tomorrow and a day, the `parkUndoable` patch for Someday and nothing for Keep, merged with `mergeChanges`; verify tests for "Default carry-over" (time of day kept, overdue and started tasks get tomorrow without a time), "Mixed decisions" (someday clears due and evening, keep writes nothing, Friday is written) and the one-batch shape (one change per task) pass with `npm test -- review`
- [x] 2.4 Add `carryOverLabel(decisions)` returning the bulk "n tasks rescheduled" label when every decision is a date and "n tasks carried over" otherwise, and the apply helper `applyCarryOver(decisions, tasks, today)` that calls `applyBatch(..., { source: 'bulk', label })` and returns the undo entry; verify a test with fake-indexeddb that one `applyCarryOver` of three tasks writes one `assistantUndo` entry whose `undoBatch` restores the three previous dues, and that a task given a date by hand in between is skipped and named, with `npm test -- review`

## 3. Shortcuts, palette and routes

- [x] 3.1 Register `go.close` (`g Shift+D`, section `go`, scope `global`) and `close.tomorrow` `t`, `close.pick` `p`, `close.someday` `y`, `close.keep` `h` (section `review`, scope `view`, views `['review']`) in `web/src/lib/shortcuts.ts`; verify `npm test -- shortcuts` passes with no conflict and `make docs` regenerates `docs/keyboard.md` with the five rows
- [x] 3.2 Handle `go.close` in `web/src/app/Shell.tsx` (`go({ view: 'review', step: 'close' })`), dispatch `route.step === 'close'` to `CloseDay` from `ReviewBundle.tsx`, and add the palette command "Close the day" to `ROUTES` in `web/src/app/palette/registry.ts`; verify `npm test -- palette shell` passes, including the registry completeness guard, and `g` then `Shift+D` opens `/review/close` in the Shell test

## 4. The Close the day screen

- [x] 4.1 Make the stepper reusable: `ReviewProgress` takes optional `ids`, `phaseOf`, `phaseTitles`, `stepTitles` (defaults: the weekly review's), and the step card header plus Back / Next bar move into `web/src/app/review/StepCard.tsx` used by `ReviewView.tsx`; verify `npm test -- review` (the existing `review.test.tsx`) passes unchanged and `make ui-check` shows no diff on the weekly review baselines (the review tests pass unchanged; `make ui-check` needs Docker here and runs in CI, see design.md Implementation notes)
- [x] 4.2 Build `web/src/app/review/CloseDay.tsx` step 1 (How the day went) as a `<dl>` of planned, done and focus from `daySummary`, with the one-line empty state; verify `closeDay.test.tsx` (happy-dom, Shell at `/review/close` with seeded tasks) checks "8 planned", "5 done", "2 of 3 done" and the empty line, and that opening the screen puts focus on the step title, with `npm test -- closeDay`
- [x] 4.3 Build step 2 (Carry over): `TaskRow` per unfinished task with a `radiogroup` of Tomorrow (default), Pick a day, Someday, Keep in Today; read-only tasks show Keep only; `useListKeys` for `j`/`k`/`c`/Enter and `useShortcutScope('view', …)` for `t`, `p`, `y`, `h`; `p` opens `DateField` in a `Dialog`; Apply calls `applyCarryOver` and `showBulkToast`; "Not applied" shows beside the count until applied; verify `closeDay.test.tsx` covers "Default carry-over" (three tasks leave Today, toast "3 tasks rescheduled" with Undo), "Mixed decisions", "Nothing to carry over" and `Ctrl+Z` undo in one step, with `npm test -- closeDay`
- [x] 4.4 Build step 3 (A line for tomorrow): one `Field` input (`maxLength` 500, Enter closes the day), the primary action "Close the day" calling `closeDay(note)` then `navigate({ view: 'today' })`; verify `closeDay.test.tsx` checks the `review` row holds `closed_at` and the trimmed note and that Today is shown afterwards, and that `]` twice reaches "Step 3 of 3", with `npm test -- closeDay`
- [x] 4.5 Add "Close the day" and "Close the day · note" stories to `web/src/app/review.stories.tsx` with `withSeed`/`withClock`; verify `npm run storybook` renders both and `make ui-check` passes once baselines are generated (new PNGs under `web/src/ui/__screenshots__/`), including the 375 px shots with the decision group wrapped under the row and no horizontal scroll (also asserted in `closeDay.test.tsx` at 375 px). Open: the stories are written and type-check, the baselines need `make ui-baselines` (Docker) and come from CI's ui-check-report artifact — Verified 2026-10-21: the story's baselines are in web/src/ui/__screenshots__ (light and dark, 375 and 1280 px) and CI's visual regression and a11y checks pass on main.
- [x] 4.6 Add the new strings to the five translated catalogs under `web/src/locales/`; verify `make i18n-check` passes

## 5. Entry points and markers

- [x] 5.1 Add the `data-close-day` row below the grouped list in `web/src/app/TaskListView.tsx` for `route.view === 'today'` ("Close the day", or "Day closed, 18:42" plus the button after a close today); verify a test in `web/src/app/taskList.test.tsx` (or the Today list test) that the row follows the last task, opens `/review/close`, and reads "Day closed" after `closeDay()` on today, and that `budget.test.tsx` still counts two rows of chrome, with `npm test -- taskList budget`
- [x] 5.2 Add the fourth line to the Review move in `web/src/app/method/LoopHome.tsx` ("Day: closed <time>" or a link "Close the day") without changing `nextMove`; verify `loopHome.test.tsx` gains "Close the day from the Review move" (link opens `/review/close`; after `closeDay()` the line reads "Day: closed" and the next move is unchanged) and "Day closed on another device" (the line updates live), with `npm test -- loopHome`
- [x] 5.3 Update `reviewMarker` in `web/src/app/Sidebar.tsx`: "Day closed" in place of the ago text when closed today and nothing is due, the sr text naming the time, and "; the day is closed" appended when a marker is due; verify `rhythms.test.tsx` gains "Day closed in the evening" and "Day closed while the weekly review is due", with `npm test -- rhythms`
- [x] 5.4 Show `yesterdaysNote` at the top of `web/src/app/review/DailyCheck.tsx` as a read-only `Notice` (`data-daily-note`), absent when there is no note or the day was closed today; verify `rhythms.test.tsx` or `review.test.tsx` gains "Yesterday's note in the morning" and "No note", with `npm test -- rhythms`

## 6. Docs and spec

- [x] 6.1 Add a "Close the day" section to `docs/method/rhythms.md` (the three steps, the keys, the note, "never due" and the Day closed text) and a paragraph to `docs/today-and-upcoming.md` (the row at the end of Today), and list the field in `docs/e2ee.md`; verify `make docs-check` passes
- [x] 6.2 Add a `close-day` shot to `scripts/docs-screenshots.mjs` (waits for `#review-step-title` at `/review/close`) and generate `docs/images/close-day-light.webp` and `close-day-dark.webp` with `make docs-screenshots`; verify the images show the Carry over step with decisions
- [x] 6.3 Run `make openspec-validate` and verify the change validates with `--strict`

## 7. Integration

- [x] 7.1 Run `make check` and verify it passes (Go tests, web tests and build, lint, ui-lint, i18n-check, docs-check, openspec-validate); add a CHANGELOG.md entry under Unreleased describing Close the day, the carry-over batch with Undo, the line for tomorrow and the two additive review fields

## Workflow follow-up

- Archive `loop-home-refresh` before this change: the `open-loops` delta here restates its Loop home wording with one added line.
- Archive this change with `/opsx:archive` once `make check` passes, then confirm `openspec validate --all --strict`.
