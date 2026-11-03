# Tasks

## 1. Compaction

- [x] 1.1 Plan per field (D1): `compactPlan` reads a field's ops without values and applies op-log-compaction D1/D3 in memory; newest-first windows of sequence numbers list the fields; the mark is a sequence number; verify `go test ./internal/sync -run Compaction` (window, winners, daily thinning, shared scope, resent op, convergence, appends, fields listed in pages)
- [x] 1.2 Short writer transactions (D2): at most 64 ops and about 20 ms each, the plan checked by index lookups (scope, winner, the day's keeper) before deleting; verify `TestCompactionRechecksBeforeDeleting` (new winner, the day's later revision gone, relabelled op) and `TestCompactionCursorsAndBudget`
- [x] 1.3 The job alternates deletion slices and incremental vacuum steps sized to about 20 ms, with the writer's automatic checkpoint off and checkpoints from the reader pool during a run (D2); the record keeps `mark`/`in_pass`; verify `go test ./internal/compaction ./internal/host` (pass spans runs, restart mid-pass, conversion, reader checkpoints)

## 2. First copy

- [x] 2.1 Server: the `latest_docs` feature leaves out superseded note history in the regular pull (D3); values fetched only for what is served; byte budget counts what is served; verify `go test ./internal/sync -run LatestDocs` (history left out, paging, byte budget)
- [x] 2.2 Convergence: a new device with `latest_docs` ends with the same note and rows as one that pulled everything, before and after the union is published and after compaction, per scope; verify `TestLatestDocsConvergence`, `TestLatestDocsPerScope`
- [x] 2.3 Web: `lib/sync.ts` sends `latest_docs` from cursor 0 until the last page, across reloads (`firstCopy` meta); verify `npx vitest run src/lib/firstCopy.test.ts src/lib/clockSkew.test.ts`, `npm test`, `npm run build`
- [x] 2.4 Older clients unchanged (D4); verify `go test ./internal/tenant -run TestV1ClientsReplay` and `go test ./internal/httpapi`

## 3. Measure and document

- [x] 3.1 `internal/perf` notes test: the reader pool wired as the server does, the first copy's pull and an older client's full pull reported; verify `make perf NOTES=1` locally
- [ ] 3.2 The notes perf job on the CI runner within every notes budget (`notes-share` raised to 130 MB with the reason of D5); verify a `workflow_dispatch` run of `perf.yml`
- [x] 3.3 The notes job runs nightly again (`.github/workflows/perf.yml`); `performance-10k` tasks 3.3 and 4.1 updated; verify `make repo-check`
- [x] 3.4 Note search keystroke (D6): plain text kept by the index, ASCII fast paths in `noteSearch.ts`, stable note list on the Notes page, deadline-based warm-up; verify `npx vitest run src/lib/noteSearch src/lib/noteList src/app/notes` (shared vectors, equivalence of the fast paths, `sameEntries`, one strip per note)
- [x] 3.5 Docs: `docs/sync.md` (Exchange, Compaction), `docs/performance.md` (notes results), `docs/backups.md` where it describes the pace; CHANGELOG; verify `make docs-check`, `make openspec-validate`
