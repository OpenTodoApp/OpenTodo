# Tasks

## 1. Vocabulary and shared vectors

- [x] 1.1 Add `ordinalArticles`, `ordinalOf`, `ofMonthWords` and `ordinalsBeforeWeekday` to `web/src/lib/nlp/vocab/types.ts` and fill them in the six `vocab/*.ts` files (design D2, D3, D4; Portuguese `{segunda: 2, quarta: 4}`, empty elsewhere); verify `cd web && npm test -- vocab` passes its shape checks for the new lists
- [x] 1.2 Add the shared cases to `web/src/lib/nlp/quickadd.vectors.json` (design D5): every scenario of the `natural-language-capture` delta in every language it names, the negative cases (`Pay the second invoice`, `Audit 5th Friday`, `Review every monday of the month` keeps `of the month`, `wait 30 seconds Monday`) and the six count-before-weekday lines; verify with `cd web && npm test -- vectors` that the new cases fail before the grammar lands and are the only failures
- [x] 1.3 Regenerate `internal/quickadd/vocab.json` with `cd web && npm run nlp:vocab` and add the four fields to `Vocab` in `internal/quickadd/vocab.go`; verify `npm test -- vocab` (staleness) and `go vet ./internal/quickadd` pass

## 2. Web parser

- [x] 2.1 Export `nthWeekdayDate(y, m, ordinal, weekday)` from `web/src/lib/recurrence.ts` over the existing `nthWeekdayOf` and cover it in `recurrence.test.ts` (second Monday of October 2026 is the 12th, last Friday the 30th); verify `cd web && npm test -- recurrence` passes and `web/src/lib/recurrence.vectors.json` is untouched
- [x] 2.2 Add `ordinalWeekdayAt` to `web/src/lib/nlp/dates.ts` and try it from `matchDateAt` (design D1: article, ordinal with `ORDINAL_RE`, weekday, optional `ordinalOf` + month [year] or `ofMonthWords`; this or next month, this or next year); verify the one-off cases of `npm test -- vectors` pass and the existing date cases still pass
- [x] 2.3 Add the `ofMonthWords` tail after monthly patterns and the literal match for a bare count before a weekday to `web/src/lib/nlp/recurrence.ts` (design D2, D3), and make `parse()` in `web/src/lib/nlp/parse.ts` skip a literal match without recording an attribute; verify every case of `npm test -- vectors` passes, including `Treffen alle 2 Montage` with no time
- [x] 2.4 Add to `web/src/lib/nlp/nlp.test.ts` the dismissal test (`Review notes from last Friday` with the due span dismissed keeps the title and sets no due) and the "no chip for a literal match" test (`Board every 2 Mondays` yields zero chips); verify `npm test -- nlp` passes
- [x] 2.5 Add the chip case to `web/src/app/quickAddRecurrence.test.tsx`: `Board every 2nd monday of the month` on 2026-10-09 shows a recurrence chip reading `every 2nd monday · Mon 12 Oct` and no due chip; verify `npm test -- quickAddRecurrence` passes, then `cd web && npm run build` and `npm run lint` pass

## 3. Go port and CLI

- [x] 3.1 Export `NthWeekdayDate` from `internal/recurrence` over `nthWeekdayOf` with a unit test; verify `go test ./internal/recurrence/...` passes and `rrule_test.go` is unchanged
- [x] 3.2 Port `ordinalWeekdayAt` into `internal/quickadd/dates.go`, the `ofMonthWords` tail and the literal match into `internal/quickadd/recurrence.go`, and the literal skip into `parser.step` in `internal/quickadd/parse.go`; verify `go test ./internal/quickadd/...` runs every shared vector green (`TestSharedVectors`) and functions stay under 150 lines (`go test ./internal/codesize/...`)
- [x] 3.3 Add the "Ordinal weekday line" case to `TestAddNatural` in `internal/cli/cli_test.go` (`ot add --natural "Board every 2nd Tuesday of the month at 10:00"` on the fixed Saturday 2026-10-10 creates `Board`, rule `every 2nd tuesday`, due 2026-10-13 10:00); verify `go test ./internal/cli/...` passes and `go test ./...` is green

## 4. Docs and specs

- [x] 4.1 Update `docs/quick-add.md` (design D7): the ordinal weekday row in the dates table with the `last Friday` note and the dismissal escape, the "of the month" and count-is-not-a-rule sentences under "Repeat and remind", the per-language examples; verify `make docs-check` passes and the new row's examples match vectors in `quickadd.vectors.json`
- [x] 4.2 Run `make openspec-validate` and verify this change validates with `--strict`

## 5. Integration

- [x] 5.1 Run `make check` and verify it passes; add a CHANGELOG.md entry under Unreleased ("Quick add understands ordinal weekdays: `second Monday`, `the 3rd Friday of November`, `last Friday`, and `every 2nd monday of the month`, in six languages and in `ot add --natural`")
- [x] 5.2 Smoke test on `./bin/opentodo` with quick-add languages `en, de`: `Dentist second Monday` shows a due chip for the coming second Monday, `Board every 2nd monday of the month` shows `every 2nd monday · <date>` and a title of `Board`, `Treffen alle 2 Montage` shows no chip; `ot add --natural "Report the 3rd Friday of November"` creates the task due 20 November; record the result in the change's notes

## Workflow follow-up

- Archive the change after review (`/opsx:archive`), confirm `openspec validate --all --strict` passes afterwards.
