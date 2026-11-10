# Tasks

## 1. One write at close

- [x] 1.1 One close batch in `web/src/lib/review` (carry-over task ops, focus fields, `closed_at`, `closed_day`, `tomorrow_note`, `carry_over` with its optional `focus` key), and Reopen and the toast's Undo restoring the focus from the record. Verify with unit tests for "Undo the whole close", "Undo after a later change", "Undo restores the focus", and an old-format record without `focus`. Run `npm test` in web/.
- [x] 1.2 Nothing is written before the close, and leaving writes nothing. Verify with an interaction test (happy-dom, `waitFor`) for "Leave without closing" and "Apply offline" (outbox).

## 2. The steps

- [x] 2.1 The Done step as compact read-only rows with the lead figures and "and n more". Verify with tests for "A day with a focus", "Agrees with Statistics" and "Nothing was planned".
- [x] 2.2 The What moves list: the per-row choice, the row menu, All to tomorrow, and the `j` `k` `t` `p` `y` `h` `d` `Shift+T` keys registered in the close-the-day scope. Verify with the shortcut registry test (no conflict) and interaction tests for every Carry over scenario.
- [x] 2.3 The Tomorrow's first thing step: tomorrow's tasks, including tonight's moves, as a radio list, with the note field and its preview. Verify with tests for "Pick the first thing", "A task moved there tonight" and "Nothing chosen".
- [x] 2.4 "Close the day" on every step and the progress indicator's decided-not-moved state. Verify with "Skip to the close", "Walk the three steps" and "Past Carry over"; update story baselines at 375 and 1280 px in light and dark (`make ui-check`).
- [x] 2.5 Done for today names tomorrow's first thing. Verify with the "Close with carry-over" test.

## 3. Docs and checks

- [x] 3.1 Update Close the day in `docs/method/rhythms.md` and `docs/today-and-upcoming.md` and the keyboard guide, and add `changelog.d/Changed/close-the-day-redesign.md`. Verify with `make docs` and `make docs-check`.
- [x] 3.2 `make i18n-check`, `make bundle-budget`, `make openspec-validate` and `make check` pass.
