# Design

## Context

`scripts/perf/run.mjs` timed a completion with `toNextPaint`: a `MutationObserver` waits for the row's change, then `requestAnimationFrame`, then `setTimeout(0)`, and the sample is `performance.now()` there minus the input event's `timeStamp`. The p95 of ten completions is their largest. After `list-rendering-at-scale` D7 the later samples are 16–60 ms on CI and the first one or two of a run 90–130 ms; the CI diagnosis (#854) showed the tick in the document about 35 ms after the input on slow runs and the harness's `setTimeout` then waiting behind other work. Whether that wait is part of what a person sees was the open question; a harness-specific end point cannot settle it.

## Decisions

**D1. The browser's Event Timing, the way INP reads it.** The page installs, before the app loads, a `PerformanceObserver({ type: 'event', durationThreshold: 16, buffered: true })` and keeps every entry that has an `interactionId`. An entry's `duration` runs from the event's `timeStamp` (the input) to the next paint after its handlers ran, processing plus presentation, rounded to 8 ms. For each completion the benchmark takes the entries that started after it sent the click (`pointerdown`, `pointerup`, `click`: one interaction id), and the longest of them is the sample, as INP takes the longest event of an interaction. The p95 over the ten completions and the median of five runs stay as they were, so the budget still means "the slow ones".

- 16 ms is the lowest threshold the API accepts. An interaction under it has no entry; it counts as 16 (an upper bound, never lower than the truth). The observer's entries are queued once the paint is presented, so the benchmark waits up to a second for them after the change is drawn.
- Chromium in the benchmark's headless mode exposes Event Timing: a local run (Playwright 1.56.1, the CI image's version, headless shell) recorded `pointerdown`, `pointerup` and `click` entries of one interaction for every completion, on desktop and in the phone profile (CPU throttled 4×), with the same start time and duration (Playwright sends the press and the release before the next frame).

**D2. The paint must show the tick.** An Event Timing duration ends at the first paint after the handlers, whatever it shows. The tick paints in the frame of the click (`list-rendering-at-scale` D3), so that paint should hold it; the benchmark checks it: the time the `MutationObserver` saw the row change must be before the interaction's last paint (start plus duration, plus 8 ms for the rounding). If a change ever arrives in a later frame (a regression of D3), the sample is the earlier timer's value for that completion and the log names it, so a late tick cannot make the metric look better. In the local runs every completion passed the check (the change 17–100 ms after the input, its paint 40–264 ms).

**D3. The earlier timer stays, reported only.** `complete-task-frame` is the p95 of the same completions by `toNextPaint`, written to the report's `reported` list and the log with no limit (`run.mjs` `REPORTED`, not `budgets.json`, so the docs check and the nightly verdict ignore it). It goes once a release or two of nightly reports have shown how the two relate.

**D4. Only the completion.** Cursor moves and keystrokes keep their timers: the owner's decision was about this metric, and the search keystroke ends at an app mark (`ot:search-results`), not at a paint. Moving them is a later choice.

## Data model, size, interface

No data model, op, sync, API or app change; no dependency; no bundle or binary change. No screen changes.

## Risks

- Event Timing's presentation time is the real frame presentation, which can come after the point the earlier timer stopped (the local runs measured each above or below the other by up to about 20 ms either way). So the new measurement is not a way to make the number smaller; it is the standard one, and the fallback of the owner (130 ms on desktop) covers a p95 still over 100.
- A Chromium change to Event Timing would change the metric; the version is pinned by the CI image.

## Results

Recorded from the CI runs in the pull request (task 2.1).
