## 1. Rule grammar

- [x] 1.1 `every N weeks on <weekdays>` in `internal/recurrence` and `web/src/lib/recurrence.ts` (parse, canonical form, next occurrence with the week phase, catch-up, first occurrence); verified by new parse, next, first and preview cases in `web/src/lib/recurrence.vectors.json` (`go test ./internal/recurrence`, `npx vitest run src/lib/recurrence`)
- [x] 1.2 RRULE `FREQ=WEEKLY;INTERVAL=N;BYDAY=…` out and back; verified by `internal/recurrence/rrule_test.go`
- [x] 1.3 Habits schedule the same dates (`web/src/lib/habits.ts`); verified by `npx vitest run src/lib/habits`
- [x] 1.4 The importer reads `every other <weekday>`; verified by `go test ./internal/importer`

## 2. Quick add

- [x] 2.1 `every other <weekday>` and `every N weeks on <weekday>` as the weekday rule, the start phrases and the connectors in `web/src/lib/nlp` and `internal/quickadd`, three vocabulary fields in each language (`npm run nlp:vocab`); verified by the new cases in `quickadd.vectors.json`, the issue's three lines and their non-cases in every language (`go test ./internal/quickadd`, `npx vitest run src/lib/nlp`), and `scripts/fuzz.sh 30s ./internal/quickadd`

## 3. Checks and docs

- [x] 3.1 `docs/recurrence.md`, `docs/quick-add.md`; changelog fragment `changelog.d/Fixed/quick-add-weekday-recurrence.md`; `make openspec-validate`, `make docs-check`
