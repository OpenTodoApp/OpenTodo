# Tasks

## 1. Rule and vectors

- [x] 1.1 `ruleval.InFindScope` and `inFindScope` (stepData.ts) with `find_scope` vectors in `web/src/lib/rules/steps.vectors.json`; verify `go test ./internal/ruleval` and `npm test` in web/
- [x] 1.2 `archived` (bool) on `find_tasks` in both step catalogues, with a check vector; verify the step vectors on both sides

## 2. Engine

- [x] 2.1 `find_tasks` (condition, query, view) applies the scope with the run's projects and the `archived` input; verify a `internal/rules` test with a live, an archived and a deleted project
- [x] 2.2 The schedule trigger's matching tasks and the scheduled sweep apply the scope; verify `go test ./internal/rules`
- [x] 2.3 Use cases: archived project left out, included with `archived`, project in the Trash never found, a saved view; verify `TestUseCases` and `usecases.test.ts`

## 3. Editor, CLI and MCP

- [x] 3.1 The preview's Find tasks and the When card count apply the scope; the card labels the input "Archived projects"; verify editor tests and `npm test`
- [x] 3.2 MCP: the routine steps description names the scope and `archived`; goldens regenerated; CLI shows the input through `ot routine show`; verify `go test ./internal/agenttools ./internal/mcp ./internal/cli`

## 4. Docs and release

- [x] 4.1 docs/routines.md, docs/filters.md, docs/api.md; verify `make docs-check`
- [x] 4.2 CHANGELOG and ROADMAP; verify `make openspec-validate` and `make check`
