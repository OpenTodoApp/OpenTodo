# Proposal

## Why

The server's time budgets are absolute milliseconds on whatever CI runner the nightly benchmark gets. The same code reads 83 to 161 ms for `server-list-project` on different runners ([#1656](https://github.com/OpenTodoApp/OpenTodo/issues/1656)). A budget tight enough to catch a regression fails on a slow runner, and one loose enough for every runner catches little.

The profile in #1656 shows that the floor is SQLite's cost per row. It is the same work on every runner, done at the runner's speed. The decision on #1656 keeps that budget at 170 ms. Paging or trimming list responses would change the API for a CI number, and we won't do that.

## What Changes

- **A reference workload, timed in each run.** It does fixed work of the same kind as the server's budgets: SQLite reads through the server's own driver, rows built into Go values, sorted and encoded as JSON. Its code and data never change with the app.
- **Every server time budget (ms or s) becomes relative.** The limit is multiplied by the reference's median in that benchmark over its baseline in `budgets.json`.
- **The absolute limit × 1.5 stays as a backstop on any runner**, so a regression can't hide behind a slow one.
- **Memory, sizes, and the desktop and phone budgets stay absolute.**
- **The alert names both limits:** "…, budget 170 ms (186 ms on this runner)".
- **`server-list-project` stays at 170 ms.**

Out of scope:
- Relative desktop and phone budgets. Those measure a browser, and need a browser reference of their own; that would be a later change if they turn out to be noisy.
- Changing any limit.
- The pi4 setting, which is measured by hand.

Advances the ROADMAP item `performance-10k` ("Budgets and tests for 10,000 tasks, on phones too"). Closes #1656.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `performance-budgets`: server time budgets are relative to a reference workload timed in the same benchmark, with an absolute backstop.

## Impact

- `internal/perf`: `reference_test.go` (new), `budgets.go` (the verdict), `server_test.go` and `notes_test.go` (the reference is timed each run), and `budgets_test.go` (new).
- `scripts/perf/budgets.json` (`reference`) and `docs/performance.md`.
- No app or server code, no dependency: the SQLite driver is the server's own. No new environment variable.
