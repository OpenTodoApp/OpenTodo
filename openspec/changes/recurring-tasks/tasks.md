# Tasks

## 1. Grammar and calculator (shared vectors)

- [ ] 1.1 Write `web/src/lib/recurrence.vectors.json` covering every pattern, `after completion`, `until`, `for N`, month-end clamping, leap day, last weekday, ordinal weekdays, catch-up; verify the file parses and each vector names rule, due, today, completedOn and expected
- [ ] 1.2 Go parser and calculator in `internal/recurrence` (parse to canonical form, `Next`, `NextAfterCompletion`); verify `TestRecurrenceVectors` runs all vectors and `TestParseRejectsInvalid` (`go test ./...`)
- [ ] 1.3 TypeScript parser and calculator in `web/src/lib/recurrence.ts`; verify `recurrence.test.ts` runs the same vectors and canonicalises `Every  2nd  Tuesday` (`npm test`)
- [ ] 1.4 Document the grammar in `docs/recurrence.md`; verify every documented example appears in the vectors

## 2. Op schema and data layer

- [ ] 2.1 Add `task.recurrence` (validation kind that runs the parser) and `task.series_id` to `internal/sync/ops.go`; verify `TestValidateRecurrenceField` (valid, invalid, too long, null) (`go test ./...`)
- [ ] 2.2 Mirror the fields in `web/src/lib/types.ts`, `TASK_FIELDS` and defaults in `web/src/lib/ops.ts`; verify `ops.test.ts` still passes and a task with `recurrence` round-trips (`npm test`)
- [ ] 2.3 Name-based id helper in `internal/ids` and `web/src/lib/ids.ts`; verify `TestNameIDDeterministic` and `ids.test.ts` produce the same UUID string for the same input on both sides (`go test ./...`, `npm test`)
- [ ] 2.4 Client `completeTask`, `skipOccurrence`, `detachOccurrence` emitting the occurrence record and the next due in one batch, honouring `until` and `for N`; verify `recurring.test.ts`: two simulated devices completing the same occurrence converge to one record and one next due; skip adds no record; `for 2 times` ends the series (`npm test`)
- [ ] 2.5 Server-side equivalent for REST `PATCH` completion of a recurring task; verify `TestRestCompleteRecurringRollsForward` (`go test ./...`)
- [ ] 2.6 Update `docs/sync.md` schema table and `docs/api.md`; verify the tables list both fields with their types

## 3. UI

- [ ] 3.1 Detail panel recurrence field with suggestions, validation message and next-three preview; skip and "This occurrence only" actions with keyboard shortcuts listed in `?`; verify browser flow: typing `every last weekday` previews three month-end weekdays offline; `npm run build` passes
- [ ] 3.2 Repeat indicator in task rows and Completed listing occurrence records; verify browser flow: complete a daily task, it stays in Today for tomorrow and an entry appears in Completed
- [ ] 3.3 Reopen behaviour for occurrence records and ended series; verify browser flow: reopening a completed occurrence yields a standalone task and the series due date does not change

## 4. Integration and docs

- [ ] 4.1 Two-device flow: set `every 3 days after completion` on A, complete on A offline Monday and on B offline Tuesday, reconnect; verify one Completed entry and the same due date on both with no console errors
- [ ] 4.2 `README.md` feature list, `CHANGELOG.md` Unreleased with the mixed-version note; verify `make check` passes
