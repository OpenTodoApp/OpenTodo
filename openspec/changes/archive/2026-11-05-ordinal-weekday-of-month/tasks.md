# Tasks

## 1. Grammar

- [x] 1.1 `internal/recurrence` and `web/src/lib/recurrence.ts`: parse `every first|1st … fourth|4th weekday`, canonical `every Nth weekday`, next occurrence counting only Monday to Friday, `after completion` refused (verified by `go test ./internal/recurrence` and `npx vitest run src/lib/recurrence.test.ts` over the shared vectors)
- [x] 1.2 Shared vectors: months starting on Saturday, Sunday and Friday, the 4th weekday across a weekend, `for N times`, `until`, catch-up, first occurrence, preview, projected occurrences (`recurrence.vectors.json`, `occurrences.vectors.json`)
- [x] 1.3 RRULE both ways as `FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=n`, other BYSETPOS values refused (`rrule_test.go`); the fuzz test checks every next date is that weekday of its month
- [x] 1.4 Habits' scheduled-day check knows the pattern (`habits.test.ts`)

## 2. Around the grammar

- [x] 2.1 Quick add in six languages on both sides (`quickadd.vectors.json`, `npx vitest run src/lib/nlp`, `go test ./internal/quickadd`)
- [x] 2.2 Importer: `every first workday` … and the BYSETPOS RRULE (`go test ./internal/importer`)
- [x] 2.3 Suggestion in the repeat field and docs (`docs/recurrence.md`, `docs/repeat-rules.md`, `docs/caldav.md`, `docs/quick-add.md`, `docs/import.md`), checked by `make docs-check`
