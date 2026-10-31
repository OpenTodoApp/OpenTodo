# Tasks

Lands after `series-occurrences` and `series-exceptions` (it uses the occurrence panel, records and the shared planning).

## 1. Schema (design D2)

- [x] 1.1 Add the `kSplit` kind and `split_from` (default null) to the `task` entry of `internal/sync/ops.go` `Schema`: `{series, date}` with an id in the task's sharing scope and a `YYYY-MM-DD` date, refused without a rule and refused as a change once set. Verify with sync tests for each rejection and a convergence test of two identical creations (`go test ./internal/sync/...`).
- [x] 1.2 Add `split_from?: { series: string; date: string } | null` to `Task` in `web/src/lib/types.ts` and to `TASK_DEFAULTS` in `web/src/lib/ops.ts`; validate the shape in the client's op guard. Verify with `npm test` in web/.
- [x] 1.3 Add a `task.split_from` op to `internal/activity/testdata/activity_fixture.json`. Verify with `go test ./internal/activity/...` and `web/src/lib/activity.test.ts`.
- [x] 1.4 Document `split_from` in `docs/sync.md` and `docs/api.md` "Task fields". Verify with `npm run docs:check` in web/.

## 2. Planning and lineage (design D1, D3, D4)

- [x] 2.1 In `web/src/lib/recurring.ts`: `lineageOf`, piece bounds, `planSplit` (rule `until`, piece with derived id, reminders, carry), `planEndFrom` (Delete this and following), the lineage count for `for N times`, and the `until` repair. Make `occurrencesInRange` respect piece bounds and lineage exceptions. Verify with vitests for every scenario of "Split a series from an occurrence", "Pieces of one lineage" and "End a series from an occurrence" (`npm test` in web/).
- [x] 2.2 Extend `web/src/lib/series.fixture.json` and `occurrences.vectors.json` with splits: same date on two devices, two dates on two devices, a counted rule, a moved occurrence after the split. Verify with `npm test` in web/.
- [x] 2.3 Port the lineage bounds, the count and `planSplit` to `internal/sync/occurrences.go`, running the same fixture and vectors; make `RecurringCompletion` count over the lineage. Verify with `go test ./internal/sync/... ./internal/recurrence/...`.
- [x] 2.4 Cap a lineage walk at 50 pieces. Verify with a test of a 60-piece lineage (`npm test` in web/, `go test ./internal/sync/...`).

## 3. Interface (design D6)

- [x] 3.1 Add This and following to the scope control (shown on later occurrences of calendar rules for editors), performing the split on the first edit, then showing the piece with the "Changed from <date> on · Undo" toast. Verify with tests for "Option offered", "Not on the current occurrence", "Study at 19:00 from Wednesday" and "Undo", and `make ui-check`.
- [x] 3.2 Add Delete this and following to the projection menu. Verify with a test for "Stop after the course ends".
- [x] 3.3 Show "Continues <title> from <date>" and "Continues as <title> from <date>" in the panel with links. Verify with a test for "Continues from".

## 4. Habits (design D5)

- [x] 4.1 Compute habit history over the lineage in `web/src/lib/habits.ts`; add the two vectors to `habits.vectors.json`. Verify with tests for "Gym days change mid-month" and "Same streak on two devices" (`npm test` in web/).

## 5. Integrations (design D7, D8)

- [x] 5.1 CalDAV: serve pieces with `RELATED-TO;RELTYPE=SIBLING` and the ended series with `UNTIL`; read a client's own this-and-future edit as a rule change and a new task. Verify with `internal/caldav` tests for both "Split series in CalDAV" scenarios (`go test ./internal/caldav/... ./internal/httpapi/...`).
- [x] 5.2 Vault: a piece is its own line with its rule; the ended series' line carries `until`. Verify with an `internal/vault` round-trip test (`go test ./internal/vault/...`).
- [x] 5.3 `POST /api/v1/tasks/{id}/split` with the `signedIn` policy, refusing read and agent tokens, through `ApplyStrict`; the occurrence list walks the lineage and reports `series_id` per date. Verify with handler tests for each "Split through the API and CLI" scenario and the policy test (`go test ./internal/httpapi/...`).
- [x] 5.4 `ot task split <id> --from <date> [--time] [--rule] [--title]`. Verify with `go test ./internal/cli/...`.

## 6. Docs and strings

- [x] 6.1 Add the strings (This and following, Delete this and following, the toast, the Continues lines) to all six locale files. Verify with the locale completeness test (`npm test` in web/).
- [x] 6.2 Update `docs/recurrence.md` ("This and following", lineages, counting, habits), `docs/calendar-views.md`, `docs/caldav.md`, `docs/vault.md`, `docs/api.md` (route, route matrix) and `docs/cli.md`. Verify with `npm run docs:check` in web/.

## 7. Finish

- [x] 7.1 Manual smoke on `make dev`: the #537 example (move the time from Wednesday onward), a habit split mid-month, two offline browsers splitting at different dates, a CalDAV client fetch, the vault.
- [x] 7.2 Run `make check`. Verify it passes.
- [x] 7.3 At archive: CHANGELOG.md entry under Unreleased ("Change a repeating task from one occurrence onward; history, streaks and counts carry across").
