# Tasks

## 1. Filter language (design D1, D2, D3)

- [x] 1.1 Parse period expressions (`this|last|next week|month`, `N weeks ago`, `N months ago`) and the `completed <cmp> <date>` term in `web/src/lib/filter/parse.ts`, print them in `printQuery`, and add `resolveRange`. Verify with vitest cases for parsing, printing round trips and the new error messages (`npm test` in web/).
- [x] 1.2 Evaluate ranges for every date field and the `completed` field in `evaluate.ts`, with `weekStart` in `FilterContext` defaulting to the preference snapshot, and count a completion date term as mentioning state. Verify with vitest cases for Monday, Sunday and Saturday week starts, month boundaries (31 March, leap February, year end), `=`/`<`/`<=`/`>`/`>=` against a period and a completion day in the viewer's zone (`npm test`).
- [x] 1.3 Port the grammar additions to `internal/filter` so saved views with the new terms validate on the server, with matching messages. Verify with `go test ./internal/filter/...` (docs examples and error table).
- [x] 1.4 Update `docs/filters.md` (grammar, terms, periods table, examples, error table) and the Filter view's usage hint. Verify with the shared docs-examples tests (`npm test`, `go test ./internal/filter/...`) and `npm run docs:check`.

## 2. Completed logbook (design D4)

- [x] 2.1 Add `web/src/lib/logbook.ts` (grouping by local completion day, headings, paging). Verify with vitest cases for Today, Yesterday, weekday headings, other-year headings and the page limit (`npm test`).
- [x] 2.2 Render the Completed view from it in `TaskListView.tsx` with counts and a "Show more" button. Verify with a happy-dom component test (groups and Show more with 250 tasks), `npm test`, `npm run build` and `make ui-lint`; update `docs/built-in-views.md` and check with `npm run docs:check`.

## 3. `completed_by` (design D5)

- [x] 3.1 Add `completed_by` to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the task defaults in `web/src/lib/ops.ts`; stamp it in `mutateMany`, carry it in copies, hide it from History versions. Verify with vitest cases for complete, cascade, reopen, recurring record and creation (`npm test`).
- [x] 3.2 Stamp it in `ApplyStrict` for task completions without it, and record null for public link ticks. Verify with Go tests for REST PATCH, the assistant `complete_tasks` tool (plain and recurring), reopen, and a public link tick (`go test ./...`).
- [x] 3.3 Document the field in `docs/sync.md` and `docs/api.md`. Verify with `npm run docs:check`.

## 4. Completion ranges for scripts and assistants (design D6)

- [x] 4.1 Add `completed_after` / `completed_before` (and `timezone`) to `GET /api/v1/tasks`. Verify with `internal/httpapi` tests for a range, invalid values, another collection and an anonymous request (`go test ./internal/httpapi/...`).
- [x] 4.2 Add the same arguments to MCP `list_tasks` and `completed_by` to task output; refresh the tools/list golden files. Verify with `internal/mcp` and `internal/agenttools` tests (`go test ./...`) and document in `docs/mcp.md`.
- [x] 4.3 Add `--completed-after` / `--completed-before` to `ot list`. Verify with `internal/cli` tests and document in `docs/cli.md`.

## 5. Integration

- [x] 5.1 Run `go vet ./...`, `go test ./...`, `npm run typecheck`, `npm test`, `npm run docs:check`, `npm run build` in web/, `make ui-lint` and `npx @fission-ai/openspec validate --all --strict`. Verify they pass.
