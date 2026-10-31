# Tasks

## 1. Parsers

- [x] 1.1 Add `everyOther`, `everyOtherAround` and `monthTextBefore` to the six vocabularies (and the Italian `a … alterne` forms to `everyOne`); regenerate `internal/quickadd/vocab.json` with `npm run nlp:vocab`
- [x] 1.2 Mark a month name alone as a bare date in `matchDateAt`, drop it after a `monthTextBefore` word, and let a later complete date replace it in `parse` (`web/src/lib/nlp`) and the Go port (`internal/quickadd`)
- [x] 1.3 Read "every other" in `matchRecurrenceAt` with a start date for weekdays, in both parsers
- [x] 1.4 Add shared vectors for every scenario in all six languages to `web/src/lib/nlp/quickadd.vectors.json`. Verify `npx vitest run src/lib/nlp` and `go test ./internal/quickadd`

## 2. Docs

- [x] 2.1 Update `docs/quick-add.md` (dates and repeats) and add CHANGELOG entries. Verify `make docs-check` and `make openspec-validate`
