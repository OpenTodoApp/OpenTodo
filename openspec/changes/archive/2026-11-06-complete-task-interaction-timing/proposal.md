# Proposal

## Why

The nightly benchmark (#854) fails on one metric: completing a task in the 2,000-row list on a computer, p95 86–131 ms on CI against 100 ms (`list-rendering-at-scale` D7). The benchmark times a completion with its own timer: from the input event to a `requestAnimationFrame` after the row changed, then a `setTimeout`. That end point is the harness's, not the browser's. It waits for the frame after the change and then for whatever task runs next, so it is neither the paint that shows the tick nor a measure other projects can compare with.

Browsers already measure this. The Event Timing API gives, for each input event, its `duration`: from the input to the next paint after its handlers ran (processing plus presentation). Interaction to Next Paint (INP, a Core Web Vital) is built on it: the longest event of an interaction. The owner chose to time completions that way (2026-11-06, option (a) of the question on #854).

## What Changes

- The `complete-task` metric, desktop and phone profile, is the interaction's Event Timing duration: a `PerformanceObserver` of type `event` with `durationThreshold: 16`, the entries of the click grouped by `interactionId`, the longest per interaction (as INP), and the p95 over the ten completions of a run, as before. An interaction with no entry took under the 16 ms threshold and counts as 16.
- The benchmark checks that the paint the interaction ends at shows the tick (the row's change was in the document by then); a completion whose change came in a later frame counts the earlier timer's value instead, and the log says so. A browser without Event Timing stops the run instead of measuring something else.
- The earlier timer stays in the report as `complete-task-frame`, without a budget, for a release or two, so the two can be compared.
- `docs/performance.md` says what is measured and why it matches the web's standard.
- If the desktop p95 still exceeds 100 ms on CI with the new measurement, the desktop limit becomes 130 ms (the owner's fallback, option (b)), with the reason in `budgets.json` and the docs page.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `performance-budgets`: how the completion budget is measured (a requirement added beside the budgets of `performance-10k`, which is not archived yet).

## Out of scope

- The other interaction metrics (cursor move, search keystroke) keep their timers; moving them to Event Timing is a later change if wanted.
- No app change: only the benchmark, its report and the docs.

Advances the road-to-1.0 item "Performance with 10,000 tasks" (`performance-10k`, #590) and `list-rendering-at-scale` task 3.1.

## Impact

- `scripts/perf/run.mjs`, `scripts/perf/budgets.json` (only with the fallback), `docs/performance.md`.
- No op field, sync, API, server, dependency, string or bundle change.
