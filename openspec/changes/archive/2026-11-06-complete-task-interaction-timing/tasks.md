# Tasks

## 1. Measurement

- [x] 1.1 `scripts/perf/run.mjs`: an Event Timing observer (`type: 'event'`, `durationThreshold: 16`) installed before the app loads; completions timed by their interaction's longest entry, the check that the tick was in the document by that paint, the earlier timer kept as the reported-only `complete-task-frame`; verify a local `PERF_RUNS=1 node scripts/perf/run.mjs` run in headless Chromium logs Event Timing entries (pointerdown, pointerup, click of one interaction) for every completion, desktop and phone profile
- [x] 1.2 `docs/performance.md`: what the completion measures and why it is the web's standard; verify `node --test scripts/perf/budgets.test.mjs` and `make docs-check`

## 2. CI

- [x] 2.1 The Performance workflow on CI at least three times; record desktop and phone p95 beside the earlier timer in the design; if the desktop median of p95s is over 100 ms, set the desktop limit to 130 ms with the reason in `budgets.json` and `docs/performance.md`; verify the workflow passes
