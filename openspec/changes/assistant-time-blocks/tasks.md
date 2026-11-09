# Tasks

## 1. Free time

- [ ] 1.1 `internal/freetime` and `web/src/lib/freeTime.ts` with `freetime.vectors.json` (events, frames, slots, timed tasks, all-day events, zones). Verify with `go test ./internal/freetime` and vitest on the same vectors; list them in `docs/contracts.md` (`make repo-check`).
- [ ] 1.2 Registry read tool `find_free_time` (arguments, 14-day limit, exclusions) and its device twin. Verify with `internal/agenttools` tests, the MCP golden `tools/list` updated, and the device read vectors; run `go test ./...`.

## 2. Blocks

- [ ] 2.1 Display tools `show_time`, `show_free_time` and `show_deadlines` (schemas, checks, the manifest). Verify with `internal/assistant` tests and `blocks.vectors.json` cases; run `go test ./...`.
- [ ] 2.2 Renderers and stories. Verify with happy-dom tests for the three scenarios, `make ui-check`, `npm test` and `npm run build`.
- [ ] 2.3 Fixed instructions on when to use each, and eval scenarios in `assistant-eval`. Verify with `go test ./internal/assistant` and a recorded eval run.
