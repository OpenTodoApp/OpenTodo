# Design

## Context

- `TestServerBudgets` (`internal/perf/server_test.go`) starts the server on a copy of the 10,000-task fixture five times and takes one sample of every server metric each time. `report()` (`budgets.go`) compares each median with `limits.server`.
- `TestNotesBudgets` does the same once on the notes fixture, for `notes-compaction` (s) and `notes-push-wait` (ms).
- #1656 measured `server-list-project` at 83–161 ms on unchanged code. The runner profile put 41 % of the list's work in SQLite stepping rows in the pure-Go driver and 36 % in a body pass, which #1672 removed. The floor is the runner's speed at this kind of work.

## Goals / Non-Goals

**Goals:**
- A server time budget means the same on every runner.
- A real regression still fails on a fast or a slow runner.
- One number in `budgets.json` says what the limits are relative to.

**Non-Goals:**
- Desktop and phone budgets.
- Changing a limit.
- Making the reference look like any single route.

## Decisions

### D1. The reference workload, timed in every run

`internal/perf/reference_test.go` writes its own SQLite database once per test: 20,000 rows in 10 projects, with an index on project and position. One round reads one project's 2,000 rows in order, builds them into Go values, sorts them and encodes them as JSON. A sample is the median of 15 rounds.

It uses the server's driver (`modernc.org/sqlite`) through `database/sql`, and none of the app's code, so a change to the app never moves it.

It is timed in each of the five server runs, between the runs and never while the server measures, so it sees the same runner state as the budgets beside it. The notes test times it before and after its work. The report shows the median as `reported.server-reference`, along with the scale.

Considered and dropped:
- **A pure CPU loop:** it misses memory and SQLite costs, which are most of the floor in #1656.
- **Timing one of the app's own routes as the reference:** the reference would then move with the app.

### D2. Relative limits

`budgets.json` gains:

```json
"reference": { "setting": "server", "baseline": <ms>, "backstop": 1.5, "units": ["ms", "s"] }
```

For a metric of that setting in one of those units:

- `scale = median(reference) / baseline`;
- the limit on this runner is `min(limit × scale, limit × backstop)`.

A faster runner gets a lower limit. Without a reference sample, or in another setting, the limit is absolute.

`baseline` is the reference's median on a CI runner. It is set from this pull request's own perf run (`perf.yml` runs on changes to `internal/perf`) and recorded in the pull request and the file's `$comment`. A later change to the reference's code changes its time, so it must reset the baseline in the same pull request.

### D3. The backstop

`limit × 1.5` holds on any runner. #1656's spread, 95 to 161 ms, is a factor of 1.7 between the fastest and slowest runners, so with the baseline at a mid runner, 1.5 covers the slow end. A runner more than 1.5 times slower than the baseline gets the backstop, not its own scale: a regression can't hide behind a slow machine.

### D4. The alert

The failure keeps the published limit and adds the one on this runner: "REST list of the 2,000-task project, p95, server, 300 ms, budget 170 ms (255 ms on this runner)". `failures.mjs` prints it unchanged.

## Data model, size

No app or server change. The test adds about 3 s per server run: writing the reference database once, then 15 rounds of about 12 ms each run. No dependency.

## Interface budget

No screen changes.

## Risks / Trade-offs

- **The reference and the routes may not slow down together** on a runner that is slow at something else, such as disk or the network stack. The backstop bounds what that can hide. The reference covers what #1656 measured: SQLite stepping and Go allocation.
- **A provisional baseline.** Until this pull request's perf run reports the CI value, the baseline is the one measured on a developer machine (about 12 ms on a 4-CPU Xeon at 2.1 GHz). Task 2.2 replaces it.
