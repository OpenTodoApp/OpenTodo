# Tasks

## 1. Shared grammar

- [x] 1.1 Add the new cases to `internal/notesearch/testdata/vectors.json` first (OR in a group, OR with a phrase, OR at the edges and doubled, lower-case `or`, quoted `"OR"`, `title:` and `text:` with words and phrases, a prefix without a value, ranking with a `text:` match, highlights of field-limited terms); verify the new cases fail with `go test ./internal/notesearch` and `npm test -- noteSearch` in web/
- [x] 1.2 `internal/notesearch`: `ParseQuery` returns groups of alternatives with a field; matching and ranking follow D1–D2; existing vectors unchanged; verify with `go test ./internal/notesearch`
- [x] 1.3 `web/src/lib/noteSearch.ts`: the same parsing, matching, ranking and snippet highlights; verify with `npm test -- noteSearch` in web/
- [x] 1.4 Callers: `internal/agenttools` `search_notes`, `internal/cli` `ot notes search` and `--search`, the palette's Notes section; tests for "CLI with OR", "Assistant title search" and "Old query unchanged"; verify with `go test ./...` and `npm test` in web/

## 2. Notes page

- [x] 2.1 `web/src/lib/noteQuery.ts`: the `changed:` range (closed, backwards, open ends) and the "This month" / "Last month" suggestions; unit tests for every scenario of "Changed within a date range"; verify with `npm test -- noteQuery` in web/
- [x] 2.2 Key suggestions offer `title:` and `text:` without making chips; interaction test in happy-dom for "Title only" and "Prefix without a value"; verify with `npm test` and `npm run build` in web/

## 3. Docs and checks

- [x] 3.1 `docs/notes-home.md` (Searching: OR, title:, text:), `docs/note-tokens.md` (the range row), `docs/cli.md` and `docs/mcp.md` where note search is described; strings in every catalog (`make i18n-check`); `changelog.d/Added/note-search-operators.md`; the ROADMAP row; verify with `make docs` and `make docs-check`
- [x] 3.2 Run `make openspec-validate`, `make bundle-budget` and `make check`
