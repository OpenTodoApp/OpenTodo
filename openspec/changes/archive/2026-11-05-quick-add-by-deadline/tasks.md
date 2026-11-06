## 1. Parser

- [x] 1.1 `byWords` in the six vocabularies (`by`, `bis`, `entro`, `até`; none in French and Spanish), kept in `before`; `internal/quickadd/vocab.json` regenerated (`vocab.test.ts` passes)
- [x] 1.2 `matchDeadlineAt` reads a by word before a date with no time after it; `matchByTimeAt` reads a by word before a time as the due time, in `web/src/lib/nlp` and `internal/quickadd` (`npm test`, `go test ./internal/quickadd`)

## 2. Tests

- [x] 2.1 Shared vectors compare `deadline` when a case states it; a case for every scenario (both runners pass)
- [x] 2.2 Unit tests in `nlp.test.ts` (chip, dismissal, times) and `fields.test.ts` (the Deadline row for `by`)

## 3. Docs

- [x] 3.1 `docs/quick-add.md` explains `by` and lists each language's by word (`make docs-check`)
- [x] 3.2 CHANGELOG entry under Unreleased
