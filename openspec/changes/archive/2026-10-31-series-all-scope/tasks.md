# Tasks

Lands after `series-exceptions` and `series-split` (it uses the occurrence panel, the carry and the lineage).

## 1. Planning (design D2)

- [x] 1.1 Add `hasPast` and `planPast` in `web/src/lib/seriesPast.ts`: past fields to done and skipped records under the carry rule, earlier pieces' fields, time and bounded rule, their open records' carry; never completion, skip or dates; no later piece. Verify with the client-only cases of 1.2 for "Fix a typo in every session", "Across a split", "A new time stays off past dates" and "An occurrence changed on its own keeps its value" (`npm test` in web/).
- [x] 1.2 Add client-only `carry_past` cases to `web/src/lib/series.fixture.json` run by `web/src/lib/series.fixture.test.ts`; the Go fixture test keeps skipping client-only cases. Verify with `npm test` in web/ and `go test ./internal/sync/...`.

## 2. Writing (design D3, D4)

- [x] 2.1 Route `updateTask` and `setRecurrence` edits of a series chosen for Also past ones through `web/src/lib/seriesPastActions.ts`: one `applyBatch` with Undo when past rows are written, the ordinary edit otherwise. Verify with the edit-path tests in `web/src/app/seriesAllScope.test.tsx` (`updateTask`, `setRecurrence`, Undo).
- [x] 2.2 Carry notes saved by the note editor under Also past ones to the records holding the series' previous text. Verify with the note test in `web/src/app/seriesAllScope.test.tsx`.

## 3. Interface (design D1)

- [x] 3.1 Show "Apply to: Only future ones · Also past ones" under the scope control on All occurrences for editors when `hasPast`, with the explanatory line and the "Changed past occurrences too · Undo" toast; reset when the panel leaves the series. Verify with happy-dom tests in `web/src/app/seriesAllScope.test.tsx` for "No past, no question", "Viewer", "Only future ones by default" and a rename with Also past ones, and `npm run build` in web/ (bundle budget).
- [x] 3.2 Add the strings to the six catalogues. Verify with `npm test` in web/ (catalogue checks).

## 4. Docs

- [x] 4.1 Describe the choice in `docs/recurrence.md` and `docs/repeating-on-the-calendar.md` (within the guide cap), and that the API's PATCH stays a row edit. Verify with `make docs-check`.
- [x] 4.2 CHANGELOG Unreleased entry and a ROADMAP row. Verify with `make repo-check`.
